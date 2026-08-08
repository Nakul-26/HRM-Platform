import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createHolidaySchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";

const { holidayCalendar } = schema;

export function holidaysRouter() {
  const app = new Hono<{ Bindings: Env }>();

  // Same as leave types — reference data every employee needs when picking
  // dates to apply for leave around, so listing is open to any authenticated user.
  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { date: holidayCalendar.date, name: holidayCalendar.name }, holidayCalendar.date);

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [rows, countRows] = await Promise.all([
        tx.select().from(holidayCalendar).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(holidayCalendar),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "leave.policy.manage")) return forbidden(c);

    const parsed = createHolidaySchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid holiday payload", parsed.error.flatten());

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.insert(holidayCalendar).values({ tenantId: auth.tenantId, ...parsed.data }).returning(),
    );
    return ok(c, row, 201);
  });

  // No soft-delete column on holiday_calendar (unlike leave_types) — a
  // mis-added holiday is just hard-deleted.
  app.delete("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "leave.policy.manage")) return forbidden(c);
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.delete(holidayCalendar).where(eq(holidayCalendar.id, id)).returning(),
    );
    if (!row) return notFound(c, "Holiday");
    return c.body(null, 204);
  });

  return app;
}
