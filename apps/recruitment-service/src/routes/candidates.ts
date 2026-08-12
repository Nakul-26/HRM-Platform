import { Hono } from "hono";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { recordAuditLog, schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createCandidateSchema, hireCandidateSchema, updateCandidateSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";
import { hireCandidate } from "../lib/hireEmployee";
import { buildResumeObjectKey, objectKeyBelongsToTenant } from "../lib/objectKey";
import { createPresignedGetUrl, createPresignedPutUrl } from "../lib/s3";

const { candidates } = schema;

// Deliberately narrow — same allowlist as apps/document-service's own
// upload endpoint (docs/architecture/06-security.md, "File handling").
const ALLOWED_RESUME_CONTENT_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

const presignResumeSchema = z.object({
  fileName: z.string().min(1).max(255),
  contentType: z.string().refine((v) => ALLOWED_RESUME_CONTENT_TYPES.has(v), "Unsupported content type"),
});

const recordResumeSchema = z.object({ objectKey: z.string().min(1) });

export function candidatesRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);

    const parsed = createCandidateSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid candidate payload", parsed.error.flatten());

    const row = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [row] = await tx.insert(candidates).values({ tenantId: auth.tenantId, ...parsed.data }).returning();
      if (row) {
        await recordAuditLog(tx, {
          tenantId: auth.tenantId,
          actorId: auth.employeeId ?? null,
          action: "candidate.created",
          resourceType: "candidate",
          resourceId: row.id,
          after: row,
          ipAddress: c.req.header("cf-connecting-ip") ?? null,
        });
      }
      return row;
    });
    return ok(c, row, 201);
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { created_at: candidates.createdAt }, candidates.createdAt);

    const jobOpeningId = c.req.query("jobOpeningId");
    const pipelineStage = c.req.query("pipelineStage");
    const conditions = [
      jobOpeningId ? eq(candidates.jobOpeningId, jobOpeningId) : undefined,
      pipelineStage ? eq(candidates.pipelineStage, pipelineStage) : undefined,
    ].filter((cond): cond is NonNullable<typeof cond> => cond !== undefined);
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [rows, countRows] = await Promise.all([
        tx.select().from(candidates).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(candidates).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(candidates).where(eq(candidates.id, id)),
    );
    if (!row) return notFound(c, "Candidate");
    return ok(c, row);
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);
    const id = c.req.param("id");

    const parsed = updateCandidateSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid candidate payload", parsed.error.flatten());

    const db = getDb(c.env.APP_DATABASE_URL);
    const result = await withTenant(db, auth.tenantId, async (tx) => {
      const [existing] = await tx.select().from(candidates).where(eq(candidates.id, id));
      if (!existing) return { kind: "not_found" as const };
      // Immutable once hired — the employee record is the source of truth
      // from here on, not the candidate row (apps/recruitment-service's hire
      // conversion, see hireEmployee.ts).
      if (existing.pipelineStage === "hired") return { kind: "already_hired" as const };

      const [row] = await tx.update(candidates).set({ ...parsed.data, updatedAt: new Date() }).where(eq(candidates.id, id)).returning();
      if (row) {
        await recordAuditLog(tx, {
          tenantId: auth.tenantId,
          actorId: auth.employeeId ?? null,
          action: "candidate.updated",
          resourceType: "candidate",
          resourceId: row.id,
          after: row,
          ipAddress: c.req.header("cf-connecting-ip") ?? null,
        });
      }
      return { kind: "updated" as const, row };
    });

    if (result.kind === "not_found") return notFound(c, "Candidate");
    if (result.kind === "already_hired") {
      return fail(c, 409, "CANDIDATE_ALREADY_HIRED", "This candidate has already been hired and can no longer be edited.");
    }
    return ok(c, result.row);
  });

  // The DoD-critical action: converts a candidate into a fully-formed
  // employee record with no manual data re-entry, idempotently (hiring the
  // same candidate twice returns the existing employee, not a duplicate).
  app.post("/:id/hire", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);
    const id = c.req.param("id");

    const parsed = hireCandidateSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid hire payload", parsed.error.flatten());

    const db = getDb(c.env.APP_DATABASE_URL);
    try {
      const result = await withTenant(db, auth.tenantId, async (tx) => {
        const [candidate] = await tx.select().from(candidates).where(eq(candidates.id, id));
        if (!candidate) return { kind: "not_found" as const };
        const hired = await hireCandidate(tx, auth.tenantId, candidate, parsed.data);
        if (!hired.alreadyHired) {
          await recordAuditLog(tx, {
            tenantId: auth.tenantId,
            actorId: auth.employeeId ?? null,
            action: "candidate.hired",
            resourceType: "candidate",
            resourceId: candidate.id,
            after: { employeeId: hired.employeeId },
            ipAddress: c.req.header("cf-connecting-ip") ?? null,
          });
        }
        return { kind: "hired" as const, ...hired };
      });
      if (result.kind === "not_found") return notFound(c, "Candidate");
      return ok(c, { employeeId: result.employeeId, alreadyHired: result.alreadyHired }, result.alreadyHired ? 200 : 201);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to hire candidate";
      // A duplicate employeeCode is caller error (409), not a server bug.
      if (message.includes("duplicate key") || message.includes("unique")) {
        return fail(c, 409, "EMPLOYEE_CODE_CONFLICT", "That employee code is already in use.");
      }
      return fail(c, 400, "HIRE_FAILED", message);
    }
  });

  app.post("/:id/resume/presign-upload", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);
    const id = c.req.param("id");

    const parsed = presignResumeSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid upload request", parsed.error.flatten());

    const [candidate] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(candidates).where(eq(candidates.id, id)),
    );
    if (!candidate) return notFound(c, "Candidate");

    const objectKey = buildResumeObjectKey(auth.tenantId, id, parsed.data.fileName);
    const uploadUrl = await createPresignedPutUrl(c.env, objectKey, parsed.data.contentType);
    return ok(c, { objectKey, uploadUrl }, 201);
  });

  app.patch("/:id/resume", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);
    const id = c.req.param("id");

    const parsed = recordResumeSchema.safeParse(await c.req.json());
    if (!parsed.success || !objectKeyBelongsToTenant(parsed.data.objectKey, auth.tenantId)) {
      return fail(c, 400, "VALIDATION_ERROR", "Invalid or missing objectKey");
    }

    const row = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [row] = await tx.update(candidates).set({ resumeR2Key: parsed.data.objectKey, updatedAt: new Date() }).where(eq(candidates.id, id)).returning();
      if (row) {
        await recordAuditLog(tx, {
          tenantId: auth.tenantId,
          actorId: auth.employeeId ?? null,
          action: "candidate.resume_uploaded",
          resourceType: "candidate",
          resourceId: row.id,
          after: { resumeR2Key: row.resumeR2Key },
          ipAddress: c.req.header("cf-connecting-ip") ?? null,
        });
      }
      return row;
    });
    if (!row) return notFound(c, "Candidate");
    return ok(c, row);
  });

  app.get("/:id/resume/download-url", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);
    const id = c.req.param("id");

    const [candidate] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(candidates).where(eq(candidates.id, id)),
    );
    if (!candidate) return notFound(c, "Candidate");
    if (!candidate.resumeR2Key) return fail(c, 404, "NOT_FOUND", "No resume has been uploaded for this candidate.");

    const downloadUrl = await createPresignedGetUrl(c.env, candidate.resumeR2Key);
    return ok(c, { downloadUrl });
  });

  return app;
}
