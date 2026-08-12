import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { recordAuditLog, schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createLeaveTypeSchema, updateLeaveTypeSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";

const { leaveTypes } = schema;

export function leaveTypesRouter() {
  const app = new Hono<{ Bindings: Env }>();

  // Leave types are reference data every employee needs to see to apply for
  // leave — any authenticated user can list/read them.
  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { name: leaveTypes.name, created_at: leaveTypes.createdAt }, leaveTypes.name);

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const where = isNull(leaveTypes.deletedAt);
      const [rows, countRows] = await Promise.all([
        tx.select().from(leaveTypes).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(leaveTypes).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(leaveTypes).where(and(eq(leaveTypes.id, id), isNull(leaveTypes.deletedAt))),
    );
    if (!row) return notFound(c, "Leave type");
    return ok(c, row);
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "leave.policy.manage")) return forbidden(c);

    const parsed = createLeaveTypeSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid leave type payload", parsed.error.flatten());

    const row = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [inserted] = await tx.insert(leaveTypes).values({ tenantId: auth.tenantId, ...parsed.data }).returning();
      await recordAuditLog(tx, {
        tenantId: auth.tenantId,
        actorId: auth.employeeId ?? null,
        action: "leave_type.created",
        resourceType: "leave_type",
        resourceId: inserted!.id,
        after: inserted,
        ipAddress: c.req.header("cf-connecting-ip") ?? null,
      });
      return inserted;
    });
    return ok(c, row, 201);
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "leave.policy.manage")) return forbidden(c);
    const id = c.req.param("id");

    const parsed = updateLeaveTypeSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid leave type payload", parsed.error.flatten());
    if (Object.keys(parsed.data).length === 0) return fail(c, 400, "VALIDATION_ERROR", "No fields to update");

    const row = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [updated] = await tx
        .update(leaveTypes)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(leaveTypes.id, id), isNull(leaveTypes.deletedAt)))
        .returning();
      if (!updated) return undefined;
      await recordAuditLog(tx, {
        tenantId: auth.tenantId,
        actorId: auth.employeeId ?? null,
        action: "leave_type.updated",
        resourceType: "leave_type",
        resourceId: updated.id,
        after: updated,
        ipAddress: c.req.header("cf-connecting-ip") ?? null,
      });
      return updated;
    });
    if (!row) return notFound(c, "Leave type");
    return ok(c, row);
  });

  app.delete("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "leave.policy.manage")) return forbidden(c);
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .update(leaveTypes)
        .set({ deletedAt: new Date() })
        .where(and(eq(leaveTypes.id, id), isNull(leaveTypes.deletedAt)))
        .returning(),
    );
    if (!row) return notFound(c, "Leave type");
    return c.body(null, 204);
  });

  return app;
}
