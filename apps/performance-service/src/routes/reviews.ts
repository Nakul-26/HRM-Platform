import { Hono } from "hono";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { schema, withTenant } from "@hrm/db";
import { can } from "@hrm/auth";
import { createReviewSchema, hasPermission, updateReviewSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";
import { resolveVisibleEmployeeIds } from "../lib/visibility";
import { serializeReview } from "../lib/serializeReview";

const { employees, reviews } = schema;

export function reviewsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!auth.employeeId) return forbidden(c);
    const parsed = createReviewSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid review payload", parsed.error.flatten());

    const db = getDb(c.env.APP_DATABASE_URL);
    const result = await withTenant(db, auth.tenantId, async (tx) => {
      const [target] = await tx.select({ managerId: employees.managerId }).from(employees).where(eq(employees.id, parsed.data.employeeId));
      if (!target) return { kind: "employee_not_found" as const };

      const isDirectReport = target.managerId === auth.employeeId;
      const isSelf = parsed.data.employeeId === auth.employeeId;
      if (!can(auth, "performance.review", { isSelf, isDirectReport })) return { kind: "forbidden" as const };

      const [row] = await tx
        .insert(reviews)
        .values({
          tenantId: auth.tenantId,
          reviewCycleId: parsed.data.reviewCycleId,
          employeeId: parsed.data.employeeId,
          reviewerId: auth.employeeId as string,
          rating: parsed.data.rating !== undefined ? String(parsed.data.rating) : undefined,
          comments: parsed.data.comments,
        })
        .returning();
      if (!row) throw new Error("Failed to create review");
      return { kind: "created" as const, row };
    });

    if (result.kind === "employee_not_found") return notFound(c, "Employee");
    if (result.kind === "forbidden") return forbidden(c);
    return ok(c, serializeReview(result.row), 201);
  });

  app.get("/me", async (c) => {
    const auth = c.get("auth");
    if (!auth.employeeId) return ok(c, []);

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .select()
        .from(reviews)
        .where(and(eq(reviews.employeeId, auth.employeeId as string), eq(reviews.status, "submitted")))
        .orderBy(reviews.createdAt),
    );
    return ok(c, rows.map(serializeReview));
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { created_at: reviews.createdAt }, reviews.createdAt);
    const reviewCycleId = c.req.query("reviewCycleId");

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      // A draft must never be visible to the employee being reviewed — only
      // the reviewer themself or an org-wide performance.review_all holder.
      const visibilityCondition = hasPermission(auth, "performance.review_all")
        ? undefined
        : or(eq(reviews.status, "submitted"), eq(reviews.reviewerId, auth.employeeId ?? ""));

      const conditions = [
        visibleIds === null ? undefined : visibleIds.length > 0 ? inArray(reviews.employeeId, visibleIds) : sql`false`,
        visibilityCondition,
        reviewCycleId ? eq(reviews.reviewCycleId, reviewCycleId) : undefined,
      ].filter((cond): cond is NonNullable<typeof cond> => cond !== undefined);
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, countRows] = await Promise.all([
        tx.select().from(reviews).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(reviews).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows.map(serializeReview), { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(reviews).where(eq(reviews.id, id)),
    );
    if (!row) return notFound(c, "Review");

    const isReviewer = row.reviewerId === auth.employeeId;
    const isReviewedEmployee = row.employeeId === auth.employeeId;
    if (row.status === "draft" && !isReviewer && !hasPermission(auth, "performance.review_all")) return forbidden(c);
    if (!isReviewer && !isReviewedEmployee && !hasPermission(auth, "performance.review_all") && !hasPermission(auth, "performance.view_all")) {
      return forbidden(c);
    }
    return ok(c, serializeReview(row));
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const parsed = updateReviewSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid review payload", parsed.error.flatten());

    const db = getDb(c.env.APP_DATABASE_URL);
    const result = await withTenant(db, auth.tenantId, async (tx) => {
      const [existing] = await tx.select().from(reviews).where(eq(reviews.id, id));
      if (!existing) return { kind: "not_found" as const };
      if (!(existing.reviewerId === auth.employeeId || hasPermission(auth, "performance.review_all"))) return { kind: "forbidden" as const };
      if (existing.status !== "draft") return { kind: "not_draft" as const };

      const [row] = await tx
        .update(reviews)
        .set({
          ...(parsed.data.rating !== undefined ? { rating: String(parsed.data.rating) } : {}),
          ...(parsed.data.comments !== undefined ? { comments: parsed.data.comments } : {}),
          updatedAt: new Date(),
        })
        .where(eq(reviews.id, id))
        .returning();
      if (!row) throw new Error("Failed to update review");
      return { kind: "updated" as const, row };
    });

    if (result.kind === "not_found") return notFound(c, "Review");
    if (result.kind === "forbidden") return forbidden(c);
    if (result.kind === "not_draft") return fail(c, 409, "REVIEW_ALREADY_SUBMITTED", "This review has already been submitted and can no longer be edited.");
    return ok(c, serializeReview(result.row));
  });

  // Idempotent — submitting an already-submitted review returns it unchanged.
  app.patch("/:id/submit", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");

    const db = getDb(c.env.APP_DATABASE_URL);
    const result = await withTenant(db, auth.tenantId, async (tx) => {
      const [existing] = await tx.select().from(reviews).where(eq(reviews.id, id));
      if (!existing) return { kind: "not_found" as const };
      if (!(existing.reviewerId === auth.employeeId || hasPermission(auth, "performance.review_all"))) return { kind: "forbidden" as const };
      if (existing.status === "submitted") return { kind: "done" as const, row: existing };

      const [row] = await tx.update(reviews).set({ status: "submitted", updatedAt: new Date() }).where(eq(reviews.id, id)).returning();
      return { kind: "done" as const, row: row ?? existing };
    });

    if (result.kind === "not_found") return notFound(c, "Review");
    if (result.kind === "forbidden") return forbidden(c);
    return ok(c, serializeReview(result.row));
  });

  return app;
}
