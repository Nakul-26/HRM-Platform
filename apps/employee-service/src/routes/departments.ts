import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createDepartmentSchema, updateDepartmentSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";

const { departments } = schema;

export function departmentsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  // Department names are non-sensitive reference data — any authenticated
  // employee can list them (e.g. to populate a directory filter dropdown).
  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { name: departments.name, created_at: departments.createdAt }, departments.name);

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const where = isNull(departments.deletedAt);
      const [rows, countRows] = await Promise.all([
        tx.select().from(departments).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(departments).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(departments).where(and(eq(departments.id, id), isNull(departments.deletedAt))),
    );
    if (!row) return notFound(c, "Department");
    return ok(c, row);
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "department.manage")) return forbidden(c);

    const parsed = createDepartmentSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid department payload", parsed.error.flatten());

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.insert(departments).values({ tenantId: auth.tenantId, ...parsed.data }).returning(),
    );
    return ok(c, row, 201);
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "department.manage")) return forbidden(c);
    const id = c.req.param("id");

    const parsed = updateDepartmentSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid department payload", parsed.error.flatten());
    if (Object.keys(parsed.data).length === 0) return fail(c, 400, "VALIDATION_ERROR", "No fields to update");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .update(departments)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(departments.id, id), isNull(departments.deletedAt)))
        .returning(),
    );
    if (!row) return notFound(c, "Department");
    return ok(c, row);
  });

  app.delete("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "department.manage")) return forbidden(c);
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .update(departments)
        .set({ deletedAt: new Date() })
        .where(and(eq(departments.id, id), isNull(departments.deletedAt)))
        .returning(),
    );
    if (!row) return notFound(c, "Department");
    return c.body(null, 204);
  });

  return app;
}
