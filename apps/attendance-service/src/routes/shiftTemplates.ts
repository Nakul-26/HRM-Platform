import { Hono } from "hono";
import { and, eq, isNull, sql } from "drizzle-orm";
import { recordAuditLog, schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createShiftTemplateSchema, updateShiftTemplateSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";

const { shiftTemplates } = schema;

export function shiftTemplatesRouter() {
  const app = new Hono<{ Bindings: Env }>();

  // Reference data every employee needs to see (e.g. to know their own
  // shift's hours) — any authenticated user can list/read.
  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { name: shiftTemplates.name, created_at: shiftTemplates.createdAt }, shiftTemplates.name);

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const where = isNull(shiftTemplates.deletedAt);
      const [rows, countRows] = await Promise.all([
        tx.select().from(shiftTemplates).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(shiftTemplates).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(shiftTemplates).where(and(eq(shiftTemplates.id, id), isNull(shiftTemplates.deletedAt))),
    );
    if (!row) return notFound(c, "Shift template");
    return ok(c, row);
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "attendance.shift.manage")) return forbidden(c);

    const parsed = createShiftTemplateSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid shift template payload", parsed.error.flatten());

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const inserted = await tx.insert(shiftTemplates).values({ tenantId: auth.tenantId, ...parsed.data }).returning();

      await recordAuditLog(tx, {
        tenantId: auth.tenantId,
        actorId: auth.employeeId ?? null,
        action: "shift_template.created",
        resourceType: "shift_template",
        resourceId: inserted[0]!.id,
        after: inserted[0],
        ipAddress: c.req.header("cf-connecting-ip") ?? null,
      });

      return inserted;
    });
    return ok(c, row, 201);
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "attendance.shift.manage")) return forbidden(c);
    const id = c.req.param("id");

    const parsed = updateShiftTemplateSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid shift template payload", parsed.error.flatten());
    if (Object.keys(parsed.data).length === 0) return fail(c, 400, "VALIDATION_ERROR", "No fields to update");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const updated = await tx
        .update(shiftTemplates)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(shiftTemplates.id, id), isNull(shiftTemplates.deletedAt)))
        .returning();

      if (updated[0]) {
        await recordAuditLog(tx, {
          tenantId: auth.tenantId,
          actorId: auth.employeeId ?? null,
          action: "shift_template.updated",
          resourceType: "shift_template",
          resourceId: updated[0].id,
          after: updated[0],
          ipAddress: c.req.header("cf-connecting-ip") ?? null,
        });
      }

      return updated;
    });
    if (!row) return notFound(c, "Shift template");
    return ok(c, row);
  });

  app.delete("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "attendance.shift.manage")) return forbidden(c);
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .update(shiftTemplates)
        .set({ deletedAt: new Date() })
        .where(and(eq(shiftTemplates.id, id), isNull(shiftTemplates.deletedAt)))
        .returning(),
    );
    if (!row) return notFound(c, "Shift template");
    return c.body(null, 204);
  });

  return app;
}
