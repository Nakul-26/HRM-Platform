import { Hono } from "hono";
import { inArray, sql } from "drizzle-orm";
import { recordAuditLog, schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createPromotionSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";
import { resolveVisibleEmployeeIds } from "../lib/visibility";
import { applyPromotion } from "../lib/promotions";

const { promotions } = schema;

export function promotionsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  // HR-driven, per the resolved decision: performance.review_all holders
  // already write reviews org-wide and hold employee.write_all, so no new
  // permission or propose/approve state machine is introduced here.
  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "performance.review_all")) return forbidden(c);

    const parsed = createPromotionSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid promotion payload", parsed.error.flatten());

    const result = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const outcome = await applyPromotion(tx, auth.tenantId, parsed.data);
      if (outcome.kind === "applied") {
        await recordAuditLog(tx, {
          tenantId: auth.tenantId,
          actorId: auth.employeeId ?? null,
          action: "promotion.applied",
          resourceType: "promotion",
          resourceId: outcome.promotion.id,
          after: {
            employeeId: outcome.promotion.employeeId,
            newDesignationId: outcome.promotion.newDesignationId,
            previousDesignationId: outcome.promotion.previousDesignationId,
          },
          ipAddress: c.req.header("cf-connecting-ip") ?? null,
        });
      }
      return outcome;
    });

    if (result.kind === "review_not_found") return fail(c, 404, "NOT_FOUND", "Review not found.");
    if (result.kind === "review_mismatch") return fail(c, 400, "VALIDATION_ERROR", "The referenced review does not belong to this employee.");
    if (result.kind === "employee_not_found") return fail(c, 404, "NOT_FOUND", "Employee not found.");
    return ok(c, result.promotion, 201);
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { effective_date: promotions.effectiveDate }, promotions.effectiveDate);

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      const where = visibleIds === null ? undefined : visibleIds.length > 0 ? inArray(promotions.employeeId, visibleIds) : sql`false`;

      const [rows, countRows] = await Promise.all([
        tx.select().from(promotions).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(promotions).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  return app;
}
