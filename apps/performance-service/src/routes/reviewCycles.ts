import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { recordAuditLog, schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createReviewCycleSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";

const { reviewCycles } = schema;

export function reviewCyclesRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "performance.review_all")) return forbidden(c);

    const parsed = createReviewCycleSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid review cycle payload", parsed.error.flatten());

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const rows = await tx.insert(reviewCycles).values({ tenantId: auth.tenantId, ...parsed.data }).returning();
      await recordAuditLog(tx, {
        tenantId: auth.tenantId,
        actorId: auth.employeeId ?? null,
        action: "review_cycle.created",
        resourceType: "review_cycle",
        resourceId: rows[0]?.id ?? null,
        after: rows[0],
        ipAddress: c.req.header("cf-connecting-ip") ?? null,
      });
      return rows;
    });
    return ok(c, row, 201);
  });

  // Open to any authenticated employee — self-service goal-setting needs to
  // populate a review-cycle picker too, not just HR admin screens (same
  // "list is broadly readable, writes are gated" convention as
  // apps/payroll-service's pay-component-types router).
  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { start_date: reviewCycles.startDate }, reviewCycles.startDate);

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [rows, countRows] = await Promise.all([
        tx.select().from(reviewCycles).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(reviewCycles),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(reviewCycles).where(eq(reviewCycles.id, id)),
    );
    if (!row) return notFound(c, "Review cycle");
    return ok(c, row);
  });

  // Idempotent — closing an already-closed cycle is a no-op, not an error.
  app.patch("/:id/close", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "performance.review_all")) return forbidden(c);
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [existing] = await tx.select({ status: reviewCycles.status }).from(reviewCycles).where(eq(reviewCycles.id, id));
      const wasAlreadyClosed = existing?.status === "closed";

      const rows = await tx.update(reviewCycles).set({ status: "closed", updatedAt: new Date() }).where(eq(reviewCycles.id, id)).returning();
      if (rows[0] && !wasAlreadyClosed) {
        await recordAuditLog(tx, {
          tenantId: auth.tenantId,
          actorId: auth.employeeId ?? null,
          action: "review_cycle.closed",
          resourceType: "review_cycle",
          resourceId: rows[0].id,
          after: rows[0],
          ipAddress: c.req.header("cf-connecting-ip") ?? null,
        });
      }
      return rows;
    });
    if (!row) return notFound(c, "Review cycle");
    return ok(c, row);
  });

  return app;
}
