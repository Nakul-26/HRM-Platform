import { Hono } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import { recordAuditLog, schema, withTenant } from "@hrm/db";
import { can, canUnscoped } from "@hrm/auth";
import { createGoalSchema, updateGoalSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";
import { resolveVisibleEmployeeIds } from "../lib/visibility";

const { employees, goals } = schema;

export function goalsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/", async (c) => {
    const auth = c.get("auth");
    const parsed = createGoalSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid goal payload", parsed.error.flatten());

    const db = getDb(c.env.APP_DATABASE_URL);
    const isSelf = parsed.data.employeeId === auth.employeeId;

    const result = await withTenant(db, auth.tenantId, async (tx) => {
      const [target] = await tx.select({ managerId: employees.managerId }).from(employees).where(eq(employees.id, parsed.data.employeeId));
      if (!target) return { kind: "employee_not_found" as const };

      const isDirectReport = target.managerId === auth.employeeId;
      const allowed = (isSelf && canUnscoped(auth, "performance.goal.set")) || can(auth, "performance.review", { isSelf, isDirectReport });
      if (!allowed) return { kind: "forbidden" as const };

      const [row] = await tx.insert(goals).values({ tenantId: auth.tenantId, ...parsed.data }).returning();
      await recordAuditLog(tx, {
        tenantId: auth.tenantId,
        actorId: auth.employeeId ?? null,
        action: "goal.created",
        resourceType: "goal",
        resourceId: row?.id ?? null,
        after: row,
        ipAddress: c.req.header("cf-connecting-ip") ?? null,
      });
      return { kind: "created" as const, row };
    });

    if (result.kind === "employee_not_found") return notFound(c, "Employee");
    if (result.kind === "forbidden") return forbidden(c);
    return ok(c, result.row, 201);
  });

  app.get("/me", async (c) => {
    const auth = c.get("auth");
    if (!auth.employeeId) return ok(c, []);

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(goals).where(eq(goals.employeeId, auth.employeeId as string)).orderBy(goals.createdAt),
    );
    return ok(c, rows);
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { created_at: goals.createdAt }, goals.createdAt);
    const reviewCycleId = c.req.query("reviewCycleId");

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      const conditions = [
        visibleIds === null ? undefined : visibleIds.length > 0 ? inArray(goals.employeeId, visibleIds) : sql`false`,
        reviewCycleId ? eq(goals.reviewCycleId, reviewCycleId) : undefined,
      ].filter((cond): cond is NonNullable<typeof cond> => cond !== undefined);
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, countRows] = await Promise.all([
        tx.select().from(goals).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(goals).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const parsed = updateGoalSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid goal payload", parsed.error.flatten());

    const db = getDb(c.env.APP_DATABASE_URL);
    const result = await withTenant(db, auth.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ goal: goals, managerId: employees.managerId })
        .from(goals)
        .innerJoin(employees, eq(goals.employeeId, employees.id))
        .where(eq(goals.id, id));
      if (!existing) return { kind: "not_found" as const };

      const isSelf = existing.goal.employeeId === auth.employeeId;
      const isDirectReport = existing.managerId === auth.employeeId;
      const allowed = (isSelf && canUnscoped(auth, "performance.goal.set")) || can(auth, "performance.review", { isSelf, isDirectReport });
      if (!allowed) return { kind: "forbidden" as const };

      const [row] = await tx.update(goals).set({ ...parsed.data, updatedAt: new Date() }).where(eq(goals.id, id)).returning();
      await recordAuditLog(tx, {
        tenantId: auth.tenantId,
        actorId: auth.employeeId ?? null,
        action: "goal.updated",
        resourceType: "goal",
        resourceId: row?.id ?? null,
        after: row,
        ipAddress: c.req.header("cf-connecting-ip") ?? null,
      });
      return { kind: "updated" as const, row };
    });

    if (result.kind === "not_found") return notFound(c, "Goal");
    if (result.kind === "forbidden") return forbidden(c);
    return ok(c, result.row);
  });

  return app;
}
