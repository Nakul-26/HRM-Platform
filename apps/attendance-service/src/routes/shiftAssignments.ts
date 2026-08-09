import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createShiftAssignmentSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";
import { resolveActiveShift } from "../lib/activeShift";

const { employeeShiftAssignments } = schema;

export function shiftAssignmentsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  // Self can always see their own current shift assignment (needed to know
  // when they're expected to clock in) — no management permission required.
  app.get("/me", async (c) => {
    const auth = c.get("auth");
    if (!auth.employeeId) return forbidden(c);
    const today = new Date().toISOString().slice(0, 10);

    const shiftTemplate = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      resolveActiveShift(tx, auth.tenantId, auth.employeeId as string, today),
    );
    return ok(c, { shiftTemplate });
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "attendance.shift.manage")) return forbidden(c);
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { effective_from: employeeShiftAssignments.effectiveFrom }, employeeShiftAssignments.effectiveFrom);

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [rows, countRows] = await Promise.all([
        tx.select().from(employeeShiftAssignments).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(employeeShiftAssignments),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "attendance.shift.manage")) return forbidden(c);

    const parsed = createShiftAssignmentSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid shift assignment payload", parsed.error.flatten());

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.insert(employeeShiftAssignments).values({ tenantId: auth.tenantId, ...parsed.data }).returning(),
    );
    return ok(c, row, 201);
  });

  app.delete("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "attendance.shift.manage")) return forbidden(c);
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .update(employeeShiftAssignments)
        .set({ deletedAt: new Date() })
        .where(eq(employeeShiftAssignments.id, id))
        .returning(),
    );
    if (!row) return notFound(c, "Shift assignment");
    return c.body(null, 204);
  });

  return app;
}
