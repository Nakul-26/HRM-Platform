import { Hono, type Context } from "hono";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { schema, withTenant } from "@hrm/db";
import { hasPermission } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { forbidden, okList } from "../lib/response";
import { countTotal, parsePagination } from "../lib/pagination";
import { toCsv } from "../lib/csv";

const { auditLogs } = schema;

function buildFilters(c: Context) {
  const actorId = c.req.query("actorId");
  const action = c.req.query("action");
  const resourceType = c.req.query("resourceType");
  const from = c.req.query("from");
  const to = c.req.query("to");

  return [
    actorId ? eq(auditLogs.actorId, actorId) : undefined,
    action ? eq(auditLogs.action, action) : undefined,
    resourceType ? eq(auditLogs.resourceType, resourceType) : undefined,
    from ? gte(auditLogs.occurredAt, new Date(from)) : undefined,
    to ? lte(auditLogs.occurredAt, new Date(to)) : undefined,
  ].filter((clause): clause is NonNullable<typeof clause> => clause !== undefined);
}

export function auditLogRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "audit_log.read")) return forbidden(c);

    const { page, perPage, offset } = parsePagination(c);
    const filters = buildFilters(c);
    const where = filters.length > 0 ? and(...filters) : undefined;

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [rows, countRows] = await Promise.all([
        tx.select().from(auditLogs).where(where).orderBy(desc(auditLogs.occurredAt)).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(auditLogs).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(
      c,
      rows.map((r) => ({ ...r, id: r.id.toString() })),
      { page, perPage, total },
    );
  });

  app.get("/export", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "audit_log.read")) return forbidden(c);

    const filters = buildFilters(c);
    const where = filters.length > 0 ? and(...filters) : undefined;

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(auditLogs).where(where).orderBy(desc(auditLogs.occurredAt)).limit(10_000),
    );

    const csv = toCsv(
      rows.map((r) => ({
        id: r.id.toString(),
        occurredAt: r.occurredAt.toISOString(),
        actorId: r.actorId ?? "",
        action: r.action,
        resourceType: r.resourceType,
        resourceId: r.resourceId ?? "",
        ipAddress: r.ipAddress ?? "",
        before: r.before ? JSON.stringify(r.before) : "",
        after: r.after ? JSON.stringify(r.after) : "",
      })),
      [
        { key: "id", header: "ID" },
        { key: "occurredAt", header: "Occurred At" },
        { key: "actorId", header: "Actor ID" },
        { key: "action", header: "Action" },
        { key: "resourceType", header: "Resource Type" },
        { key: "resourceId", header: "Resource ID" },
        { key: "ipAddress", header: "IP Address" },
        { key: "before", header: "Before" },
        { key: "after", header: "After" },
      ],
    );

    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=audit-log.csv" },
    });
  });

  return app;
}
