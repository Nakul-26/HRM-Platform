import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createDesignationSchema, updateDesignationSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";

const { designations } = schema;

export function designationsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { title: designations.title, created_at: designations.createdAt }, designations.title);

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const where = isNull(designations.deletedAt);
      const [rows, countRows] = await Promise.all([
        tx.select().from(designations).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(designations).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(designations).where(and(eq(designations.id, id), isNull(designations.deletedAt))),
    );
    if (!row) return notFound(c, "Designation");
    return ok(c, row);
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "department.manage")) return forbidden(c);

    const parsed = createDesignationSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid designation payload", parsed.error.flatten());

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.insert(designations).values({ tenantId: auth.tenantId, ...parsed.data }).returning(),
    );
    return ok(c, row, 201);
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "department.manage")) return forbidden(c);
    const id = c.req.param("id");

    const parsed = updateDesignationSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid designation payload", parsed.error.flatten());
    if (Object.keys(parsed.data).length === 0) return fail(c, 400, "VALIDATION_ERROR", "No fields to update");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .update(designations)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(designations.id, id), isNull(designations.deletedAt)))
        .returning(),
    );
    if (!row) return notFound(c, "Designation");
    return ok(c, row);
  });

  app.delete("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "department.manage")) return forbidden(c);
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .update(designations)
        .set({ deletedAt: new Date() })
        .where(and(eq(designations.id, id), isNull(designations.deletedAt)))
        .returning(),
    );
    if (!row) return notFound(c, "Designation");
    return c.body(null, 204);
  });

  return app;
}
