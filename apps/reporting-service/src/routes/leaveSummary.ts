import { Hono } from "hono";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { schema, withTenant, type Database } from "@hrm/db";
import type { Env } from "../env";
import { getDb } from "../db";
import { ok } from "../lib/response";
import { toCsv } from "../lib/csv";
import { resolveVisibleEmployeeIds } from "../lib/visibility";

const { leaveRequests, leaveBalances, leaveTypes, employees } = schema;

interface LeaveSummaryRow {
  employeeId: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  leaveTypeName: string;
  entitled: string;
  used: string;
  carriedForward: string;
  takenInPeriod: string;
}

async function loadSummary(tx: Database, visibleIds: string[] | null, year: number, from: string, to: string): Promise<LeaveSummaryRow[]> {
  const scope = (column: typeof leaveBalances.employeeId | typeof leaveRequests.employeeId) =>
    visibleIds === null ? undefined : visibleIds.length > 0 ? inArray(column, visibleIds) : sql`false`;

  const balanceRows = await tx
    .select({
      employeeId: leaveBalances.employeeId,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      leaveTypeId: leaveBalances.leaveTypeId,
      leaveTypeName: leaveTypes.name,
      entitled: leaveBalances.entitled,
      used: leaveBalances.used,
      carriedForward: leaveBalances.carriedForward,
    })
    .from(leaveBalances)
    .innerJoin(employees, eq(leaveBalances.employeeId, employees.id))
    .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
    .where(and(eq(leaveBalances.year, year), scope(leaveBalances.employeeId)));

  const takenFilters = [
    eq(leaveRequests.status, "approved"),
    lte(leaveRequests.startDate, to),
    gte(leaveRequests.endDate, from),
    scope(leaveRequests.employeeId),
  ].filter((clause): clause is NonNullable<typeof clause> => clause !== undefined);

  const takenRows = await tx
    .select({
      employeeId: leaveRequests.employeeId,
      leaveTypeId: leaveRequests.leaveTypeId,
      taken: sql<string>`coalesce(sum(${leaveRequests.days}), 0)`,
    })
    .from(leaveRequests)
    .where(and(...takenFilters))
    .groupBy(leaveRequests.employeeId, leaveRequests.leaveTypeId);

  const takenMap = new Map(takenRows.map((r) => [`${r.employeeId}:${r.leaveTypeId}`, r.taken]));

  return balanceRows.map((r) => ({
    employeeId: r.employeeId,
    employeeCode: r.employeeCode,
    firstName: r.firstName,
    lastName: r.lastName,
    leaveTypeName: r.leaveTypeName,
    entitled: r.entitled,
    used: r.used,
    carriedForward: r.carriedForward,
    takenInPeriod: takenMap.get(`${r.employeeId}:${r.leaveTypeId}`) ?? "0",
  }));
}

export function leaveSummaryRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const year = Number.parseInt(c.req.query("year") ?? String(new Date().getFullYear()), 10);
    const from = c.req.query("from") ?? `${year}-01-01`;
    const to = c.req.query("to") ?? `${year}-12-31`;

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      return loadSummary(tx, visibleIds, year, from, to);
    });

    return ok(c, rows);
  });

  app.get("/export", async (c) => {
    const auth = c.get("auth");
    const year = Number.parseInt(c.req.query("year") ?? String(new Date().getFullYear()), 10);
    const from = c.req.query("from") ?? `${year}-01-01`;
    const to = c.req.query("to") ?? `${year}-12-31`;

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      return loadSummary(tx, visibleIds, year, from, to);
    });

    const csv = toCsv(rows, [
      { key: "employeeCode", header: "Employee Code" },
      { key: "firstName", header: "First Name" },
      { key: "lastName", header: "Last Name" },
      { key: "leaveTypeName", header: "Leave Type" },
      { key: "entitled", header: "Entitled" },
      { key: "used", header: "Used (Year to Date)" },
      { key: "carriedForward", header: "Carried Forward" },
      { key: "takenInPeriod", header: "Taken in Period" },
    ]);

    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=leave-summary.csv" },
    });
  });

  return app;
}
