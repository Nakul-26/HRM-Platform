import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createPayComponentTypeSchema, updatePayComponentTypeSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";

const { payComponentTypes } = schema;

export function componentTypesRouter() {
  const app = new Hono<{ Bindings: Env }>();

  // Reference data the salary-structure builder needs — any authenticated user can list/read.
  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { code: payComponentTypes.code, created_at: payComponentTypes.createdAt }, payComponentTypes.code);

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const where = isNull(payComponentTypes.deletedAt);
      const [rows, countRows] = await Promise.all([
        tx.select().from(payComponentTypes).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(payComponentTypes).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "payroll.structure.manage")) return forbidden(c);

    const parsed = createPayComponentTypeSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid pay component type payload", parsed.error.flatten());

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.insert(payComponentTypes).values({ tenantId: auth.tenantId, ...parsed.data }).returning(),
    );
    return ok(c, row, 201);
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "payroll.structure.manage")) return forbidden(c);
    const id = c.req.param("id");

    const parsed = updatePayComponentTypeSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid pay component type payload", parsed.error.flatten());
    if (Object.keys(parsed.data).length === 0) return fail(c, 400, "VALIDATION_ERROR", "No fields to update");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .update(payComponentTypes)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(payComponentTypes.id, id), isNull(payComponentTypes.deletedAt)))
        .returning(),
    );
    if (!row) return notFound(c, "Pay component type");
    return ok(c, row);
  });

  app.delete("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "payroll.structure.manage")) return forbidden(c);
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .update(payComponentTypes)
        .set({ deletedAt: new Date() })
        .where(and(eq(payComponentTypes.id, id), isNull(payComponentTypes.deletedAt)))
        .returning(),
    );
    if (!row) return notFound(c, "Pay component type");
    return c.body(null, 204);
  });

  return app;
}
