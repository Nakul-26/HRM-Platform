import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { recordAuditLog, schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createBranchSchema, updateBranchSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";

const { branches } = schema;

export function branchesRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { name: branches.name, created_at: branches.createdAt }, branches.name);

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const where = isNull(branches.deletedAt);
      const [rows, countRows] = await Promise.all([
        tx.select().from(branches).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(branches).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(branches).where(and(eq(branches.id, id), isNull(branches.deletedAt))),
    );
    if (!row) return notFound(c, "Branch");
    return ok(c, row);
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "department.manage")) return forbidden(c);

    const parsed = createBranchSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid branch payload", parsed.error.flatten());

    const row = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [inserted] = await tx.insert(branches).values({ tenantId: auth.tenantId, ...parsed.data }).returning();
      await recordAuditLog(tx, {
        tenantId: auth.tenantId,
        actorId: auth.employeeId ?? null,
        action: "branch.created",
        resourceType: "branch",
        resourceId: inserted?.id ?? null,
        after: inserted,
        ipAddress: c.req.header("cf-connecting-ip") ?? null,
      });
      return inserted;
    });
    return ok(c, row, 201);
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "department.manage")) return forbidden(c);
    const id = c.req.param("id");

    const parsed = updateBranchSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid branch payload", parsed.error.flatten());
    if (Object.keys(parsed.data).length === 0) return fail(c, 400, "VALIDATION_ERROR", "No fields to update");

    const row = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [updated] = await tx
        .update(branches)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(branches.id, id), isNull(branches.deletedAt)))
        .returning();
      if (!updated) return undefined;
      await recordAuditLog(tx, {
        tenantId: auth.tenantId,
        actorId: auth.employeeId ?? null,
        action: "branch.updated",
        resourceType: "branch",
        resourceId: updated.id,
        after: updated,
        ipAddress: c.req.header("cf-connecting-ip") ?? null,
      });
      return updated;
    });
    if (!row) return notFound(c, "Branch");
    return ok(c, row);
  });

  app.delete("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "department.manage")) return forbidden(c);
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .update(branches)
        .set({ deletedAt: new Date() })
        .where(and(eq(branches.id, id), isNull(branches.deletedAt)))
        .returning(),
    );
    if (!row) return notFound(c, "Branch");
    return c.body(null, 204);
  });

  return app;
}
