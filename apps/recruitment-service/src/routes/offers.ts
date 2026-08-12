import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { recordAuditLog, schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createOfferSchema, updateOfferStatusSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok } from "../lib/response";

const { offers } = schema;

// `offeredCtc` is a Postgres `numeric` column — the driver returns it as a
// string; routes convert to `number` before responding (same convention as
// apps/payroll-service's payslip amounts).
function serializeOffer(row: typeof offers.$inferSelect) {
  return { ...row, offeredCtc: Number(row.offeredCtc) };
}

export function offersRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);

    const parsed = createOfferSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid offer payload", parsed.error.flatten());

    const row = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [row] = await tx
        .insert(offers)
        .values({ tenantId: auth.tenantId, ...parsed.data, offeredCtc: String(parsed.data.offeredCtc) })
        .returning();
      if (row) {
        await recordAuditLog(tx, {
          tenantId: auth.tenantId,
          actorId: auth.employeeId ?? null,
          action: "offer.created",
          resourceType: "offer",
          resourceId: row.id,
          after: row,
          ipAddress: c.req.header("cf-connecting-ip") ?? null,
        });
      }
      return row;
    });
    return ok(c, row ? serializeOffer(row) : row, 201);
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);

    const candidateId = c.req.query("candidateId");
    if (!candidateId) return fail(c, 400, "VALIDATION_ERROR", "candidateId query parameter is required");

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(offers).where(eq(offers.candidateId, candidateId)).orderBy(offers.createdAt),
    );
    return ok(c, rows.map(serializeOffer));
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);
    const id = c.req.param("id");

    const parsed = updateOfferStatusSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid offer payload", parsed.error.flatten());

    const row = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [row] = await tx.update(offers).set({ status: parsed.data.status, updatedAt: new Date() }).where(eq(offers.id, id)).returning();
      if (row) {
        await recordAuditLog(tx, {
          tenantId: auth.tenantId,
          actorId: auth.employeeId ?? null,
          action: "offer.status_updated",
          resourceType: "offer",
          resourceId: row.id,
          after: { status: row.status },
          ipAddress: c.req.header("cf-connecting-ip") ?? null,
        });
      }
      return row;
    });
    if (!row) return notFound(c, "Offer");
    return ok(c, serializeOffer(row));
  });

  return app;
}
