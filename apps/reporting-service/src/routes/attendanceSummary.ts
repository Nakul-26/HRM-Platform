import { Hono } from "hono";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { schema, withTenant, type Database } from "@hrm/db";
import type { Env } from "../env";
import { getDb } from "../db";
import { ok } from "../lib/response";
import { toCsv } from "../lib/csv";
import { resolveVisibleEmployeeIds } from "../lib/visibility";

const { attendanceRecords, employees } = schema;

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

async function loadSummary(tx: Database, visibleIds: string[] | null, from: string, to: string) {
  const scope = visibleIds === null ? undefined : visibleIds.length > 0 ? inArray(attendanceRecords.employeeId, visibleIds) : sql`false`;
  const filters = [gte(attendanceRecords.workDate, from), lte(attendanceRecords.workDate, to), scope].filter(
    (clause): clause is NonNullable<typeof clause> => clause !== undefined,
  );

  return tx
    .select({
      employeeId: attendanceRecords.employeeId,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      presentDays: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'present')::int`,
      absentDays: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'absent')::int`,
      halfDays: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'half_day')::int`,
      onLeaveDays: sql<number>`count(*) filter (where ${attendanceRecords.status} = 'on_leave')::int`,
      lateDays: sql<number>`count(*) filter (where ${attendanceRecords.lateMinutes} > 0)::int`,
    })
    .from(attendanceRecords)
    .innerJoin(employees, eq(attendanceRecords.employeeId, employees.id))
    .where(and(...filters))
    .groupBy(attendanceRecords.employeeId, employees.employeeCode, employees.firstName, employees.lastName)
    .orderBy(employees.firstName);
}

export function attendanceSummaryRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const from = c.req.query("from") ?? `${new Date().toISOString().slice(0, 7)}-01`;
    const to = c.req.query("to") ?? todayDateString();

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      return loadSummary(tx, visibleIds, from, to);
    });

    return ok(c, rows);
  });

  app.get("/export", async (c) => {
    const auth = c.get("auth");
    const from = c.req.query("from") ?? `${new Date().toISOString().slice(0, 7)}-01`;
    const to = c.req.query("to") ?? todayDateString();

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      return loadSummary(tx, visibleIds, from, to);
    });

    const csv = toCsv(rows, [
      { key: "employeeCode", header: "Employee Code" },
      { key: "firstName", header: "First Name" },
      { key: "lastName", header: "Last Name" },
      { key: "presentDays", header: "Present Days" },
      { key: "absentDays", header: "Absent Days" },
      { key: "halfDays", header: "Half Days" },
      { key: "onLeaveDays", header: "On Leave Days" },
      { key: "lateDays", header: "Late Days" },
    ]);

    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=attendance-summary.csv" },
    });
  });

  return app;
}
