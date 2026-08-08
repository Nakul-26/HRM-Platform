import { Hono } from "hono";
import { z } from "zod";
import { hasPermission } from "@hrm/types";
import type { Env } from "../env";
import { buildObjectKey, objectKeyBelongsToTenant } from "../lib/objectKey";
import { createPresignedGetUrl, createPresignedPutUrl } from "../s3";

// Deliberately narrow — this is a document *upload* endpoint, not a general
// file store; expanding this list is a conscious security decision, not a
// config tweak (docs/architecture/06-security.md, "File handling").
const ALLOWED_CONTENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const presignUploadSchema = z.object({
  employeeId: z.string().uuid(),
  fileName: z.string().min(1).max(255),
  contentType: z.string().refine((v) => ALLOWED_CONTENT_TYPES.has(v), "Unsupported content type"),
});

const EXPIRES_IN_SECONDS = 15 * 60;

export function documentsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/presign-upload", async (c) => {
    const auth = c.get("auth");
    const parsed = presignUploadSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json(
        {
          error: { code: "VALIDATION_ERROR", message: "Invalid upload request", details: parsed.error.flatten() },
          requestId: c.get("requestId"),
        },
        400,
      );
    }

    const { employeeId, fileName, contentType } = parsed.data;
    // Upload on your own behalf, or an HR-admin uploading for someone else
    // (e.g. during onboarding, before that employee has self-service
    // access) — the same bar as recording the resulting metadata in
    // apps/employee-service's POST /employees/:id/documents.
    const isSelf = employeeId === auth.employeeId;
    if (!isSelf && !hasPermission(auth, "employee.write_all")) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "You do not have permission to upload for this employee." }, requestId: c.get("requestId") },
        403,
      );
    }

    const objectKey = buildObjectKey(auth.tenantId, employeeId, fileName);
    const uploadUrl = await createPresignedPutUrl(c.env, objectKey, contentType, EXPIRES_IN_SECONDS);

    return c.json({ data: { objectKey, uploadUrl, expiresIn: EXPIRES_IN_SECONDS }, requestId: c.get("requestId") }, 201);
  });

  app.get("/download-url", async (c) => {
    const auth = c.get("auth");
    const objectKey = c.req.query("objectKey");
    if (!objectKey) {
      return c.json(
        { error: { code: "VALIDATION_ERROR", message: "objectKey query parameter is required" }, requestId: c.get("requestId") },
        400,
      );
    }

    // Defense in depth: even a valid, correctly-signed JWT for tenant A must
    // never mint a working URL for tenant B's object, regardless of how it
    // learned the key (docs/architecture/03-multi-tenancy.md).
    if (!objectKeyBelongsToTenant(objectKey, auth.tenantId)) {
      return c.json(
        { error: { code: "FORBIDDEN", message: "This document does not belong to your tenant." }, requestId: c.get("requestId") },
        403,
      );
    }

    const downloadUrl = await createPresignedGetUrl(c.env, objectKey, EXPIRES_IN_SECONDS);
    return c.json({ data: { downloadUrl, expiresIn: EXPIRES_IN_SECONDS }, requestId: c.get("requestId") }, 200);
  });

  return app;
}
