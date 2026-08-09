import { Hono } from "hono";
import { and, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { schema, withTenant, type Database } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { clockInSchema, clockOutSchema, hasPermission, type AttendanceRecord, type AuthContext } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";
import { resolveActiveShift } from "../lib/activeShift";
import { computeLateMinutes, computeOvertimeMinutes } from "../lib/shiftMath";

const { attendanceRecords, employees } = schema;

function serializeRecord(row: typeof attendanceRecords.$inferSelect): AttendanceRecord {
  return {
    ...row,
    id: String(row.id),
    status: row.status as AttendanceRecord["status"],
    source: row.source as AttendanceRecord["source"],
    clockIn: row.clockIn ? row.clockIn.toISOString() : null,
    clockOut: row.clockOut ? row.clockOut.toISOString() : null,
  };
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Rows the caller may see: org-wide (`null`) if `attendance.read_all`, else self + direct reports if `attendance.read`, else self only. */
async function resolveVisibleEmployeeIds(tx: Database, auth: AuthContext): Promise<string[] | null> {
  if (hasPermission(auth, "attendance.read_all")) return null;

  const ids: string[] = [];
  if (auth.employeeId) {
    ids.push(auth.employeeId);
    if (canUnscoped(auth, "attendance.read")) {
      const reports = await tx.select({ id: employees.id }).from(employees).where(eq(employees.managerId, auth.employeeId));
      ids.push(...reports.map((r) => r.id));
    }
  }
  return ids;
}

export function attendanceRecordsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/clock-in", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "attendance.clock") || !auth.employeeId) return forbidden(c);

    const parsed = clockInSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid clock-in payload", parsed.error.flatten());

    const employeeId = auth.employeeId;
    const workDate = todayDateString();
    const now = new Date();
    const db = getDb(c.env.APP_DATABASE_URL);

    // Insert-or-conditionally-update, not select-then-branch: two genuinely
    // concurrent clock-ins for the same employee/day (e.g. a network retry
    // firing twice) would otherwise both pass a SELECT check before either
    // commits, then race on the unique (tenant,employee,workDate) constraint
    // — the loser would 500 instead of cleanly 409ing. The `WHERE clock_in
    // IS NULL` guard on the fallback UPDATE makes "already clocked in" safe
    // under real concurrency, not just under sequential requests.
    const result = await withTenant(db, auth.tenantId, async (tx) => {
      const shift = await resolveActiveShift(tx, auth.tenantId, employeeId, workDate);
      const lateMinutes = computeLateMinutes(shift, workDate, now);
      const source = parsed.data.source ?? "web";

      const [inserted] = await tx
        .insert(attendanceRecords)
        .values({ tenantId: auth.tenantId, employeeId, workDate, clockIn: now, status: "present", source, lateMinutes })
        .onConflictDoNothing({ target: [attendanceRecords.tenantId, attendanceRecords.employeeId, attendanceRecords.workDate] })
        .returning();
      if (inserted) return { row: inserted };

      const [updated] = await tx
        .update(attendanceRecords)
        .set({ clockIn: now, status: "present", source, lateMinutes, updatedAt: new Date() })
        .where(
          and(
            eq(attendanceRecords.tenantId, auth.tenantId),
            eq(attendanceRecords.employeeId, employeeId),
            eq(attendanceRecords.workDate, workDate),
            isNull(attendanceRecords.clockIn),
          ),
        )
        .returning();
      if (updated) return { row: updated };
      return { error: "ALREADY_CLOCKED_IN" as const };
    });

    if ("error" in result) return fail(c, 409, result.error, "Already clocked in today.");
    return ok(c, serializeRecord(result.row), 201);
  });

  app.post("/clock-out", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "attendance.clock") || !auth.employeeId) return forbidden(c);

    const parsed = clockOutSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid clock-out payload", parsed.error.flatten());

    const employeeId = auth.employeeId;
    const workDate = todayDateString();
    const now = new Date();
    const db = getDb(c.env.APP_DATABASE_URL);

    // Same atomic-guard reasoning as clock-in: the UPDATE's own WHERE clause
    // (not a preceding SELECT) is what actually prevents two concurrent
    // clock-outs from both winning and silently overwriting each other's
    // overtime calculation.
    const result = await withTenant(db, auth.tenantId, async (tx) => {
      const shift = await resolveActiveShift(tx, auth.tenantId, employeeId, workDate);
      const overtimeMinutes = computeOvertimeMinutes(shift, workDate, now);

      const [updated] = await tx
        .update(attendanceRecords)
        .set({ clockOut: now, overtimeMinutes, updatedAt: new Date() })
        .where(
          and(
            eq(attendanceRecords.tenantId, auth.tenantId),
            eq(attendanceRecords.employeeId, employeeId),
            eq(attendanceRecords.workDate, workDate),
            isNotNull(attendanceRecords.clockIn),
            isNull(attendanceRecords.clockOut),
          ),
        )
        .returning();
      if (updated) return { row: updated };

      const [existing] = await tx
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.tenantId, auth.tenantId),
            eq(attendanceRecords.employeeId, employeeId),
            eq(attendanceRecords.workDate, workDate),
          ),
        );
      if (!existing?.clockIn) return { error: "NOT_CLOCKED_IN" as const };
      return { error: "ALREADY_CLOCKED_OUT" as const };
    });

    if ("error" in result) {
      const message = result.error === "NOT_CLOCKED_IN" ? "You haven't clocked in today." : "Already clocked out today.";
      return fail(c, 409, result.error, message);
    }
    return ok(c, serializeRecord(result.row));
  });

  app.get("/me", async (c) => {
    const auth = c.get("auth");
    if (!auth.employeeId) return forbidden(c);
    const from = c.req.query("from") ?? `${new Date().toISOString().slice(0, 7)}-01`;
    const to = c.req.query("to") ?? todayDateString();

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.employeeId, auth.employeeId as string),
            gte(attendanceRecords.workDate, from),
            lte(attendanceRecords.workDate, to),
          ),
        )
        .orderBy(attendanceRecords.workDate),
    );
    return ok(c, rows.map(serializeRecord));
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { work_date: attendanceRecords.workDate }, attendanceRecords.workDate);
    const from = c.req.query("from");
    const to = c.req.query("to");

    const db = getDb(c.env.APP_DATABASE_URL);
    const { rows, total } = await withTenant(db, auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      const filters = [
        from ? gte(attendanceRecords.workDate, from) : undefined,
        to ? lte(attendanceRecords.workDate, to) : undefined,
        visibleIds === null ? undefined : visibleIds.length > 0 ? inArray(attendanceRecords.employeeId, visibleIds) : sql`false`,
      ].filter((clause): clause is NonNullable<typeof clause> => clause !== undefined);
      const where = filters.length > 0 ? and(...filters) : undefined;

      const [rows, countRows] = await Promise.all([
        tx.select().from(attendanceRecords).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(attendanceRecords).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows.map(serializeRecord), { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    if (!/^\d+$/.test(id)) return notFound(c, "Attendance record");
    const db = getDb(c.env.APP_DATABASE_URL);

    const [row] = await withTenant(db, auth.tenantId, (tx) =>
      tx
        .select({ record: attendanceRecords, managerId: employees.managerId })
        .from(attendanceRecords)
        .innerJoin(employees, eq(attendanceRecords.employeeId, employees.id))
        .where(eq(attendanceRecords.id, BigInt(id))),
    );
    if (!row) return notFound(c, "Attendance record");

    const isSelf = row.record.employeeId === auth.employeeId;
    const isManagerOfOwner = row.managerId === auth.employeeId;
    if (!isSelf && !hasPermission(auth, "attendance.read_all") && !(canUnscoped(auth, "attendance.read") && isManagerOfOwner)) {
      return forbidden(c);
    }

    return ok(c, serializeRecord(row.record));
  });

  return app;
}
