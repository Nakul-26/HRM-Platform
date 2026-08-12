import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createJobOpeningSchema, updateJobOpeningSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";

const { jobOpenings } = schema;

export function jobOpeningsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);

    const parsed = createJobOpeningSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid job opening payload", parsed.error.flatten());

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.insert(jobOpenings).values({ tenantId: auth.tenantId, ...parsed.data }).returning(),
    );
    return ok(c, row, 201);
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { created_at: jobOpenings.createdAt }, jobOpenings.createdAt);

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [rows, countRows] = await Promise.all([
        tx.select().from(jobOpenings).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(jobOpenings),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(jobOpenings).where(eq(jobOpenings.id, id)),
    );
    if (!row) return notFound(c, "Job opening");
    return ok(c, row);
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);
    const id = c.req.param("id");

    const parsed = updateJobOpeningSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid job opening payload", parsed.error.flatten());

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.update(jobOpenings).set({ ...parsed.data, updatedAt: new Date() }).where(eq(jobOpenings.id, id)).returning(),
    );
    if (!row) return notFound(c, "Job opening");
    return ok(c, row);
  });

  return app;
}
