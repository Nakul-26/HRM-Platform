import { Hono, type Context } from "hono";
import { and, eq, inArray, sql } from "drizzle-orm";
import { schema, withTenant, type Database } from "@hrm/db";
import { can, canUnscoped } from "@hrm/auth";
import {
  applyCorrectionSchema,
  correctionDecisionSchema,
  hasPermission,
  type AttendanceCorrection,
  type AuthContext,
} from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";
import { resolveActiveShift } from "../lib/activeShift";
import { computeLateMinutes, computeOvertimeMinutes } from "../lib/shiftMath";

const { attendanceCorrections, attendanceRecords, employees } = schema;

type AppContext = Context<{ Bindings: Env }>;

function serializeCorrection(row: typeof attendanceCorrections.$inferSelect): AttendanceCorrection {
  return {
    ...row,
    status: row.status as AttendanceCorrection["status"],
    requestedStatus: row.requestedStatus as AttendanceCorrection["requestedStatus"],
    requestedClockIn: row.requestedClockIn ? row.requestedClockIn.toISOString() : null,
    requestedClockOut: row.requestedClockOut ? row.requestedClockOut.toISOString() : null,
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

/** Rows the caller may see: org-wide (`null`) if `attendance.correct_all`, else self + direct reports if `attendance.correct`, else self only. */
async function resolveVisibleEmployeeIds(tx: Database, auth: AuthContext): Promise<string[] | null> {
  if (hasPermission(auth, "attendance.correct_all")) return null;

  const ids: string[] = [];
  if (auth.employeeId) {
    ids.push(auth.employeeId);
    if (canUnscoped(auth, "attendance.correct")) {
      const reports = await tx.select({ id: employees.id }).from(employees).where(eq(employees.managerId, auth.employeeId));
      ids.push(...reports.map((r) => r.id));
    }
  }
  return ids;
}

async function decide(c: AppContext, targetStatus: "approved" | "rejected") {
  const auth = c.get("auth");
  // A generic Context (shared by both /approve and /reject) can't infer the
  // ":id" param's literal type the way an inline handler can — it's always
  // present at runtime since both routes declare it.
  const id = c.req.param("id") as string;
  if (!auth.employeeId) return forbidden(c);

  const parsed = correctionDecisionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid decision payload", parsed.error.flatten());

  const employeeId = auth.employeeId;
  const db = getDb(c.env.APP_DATABASE_URL);
  const result = await withTenant(db, auth.tenantId, async (tx) => {
    const [existing] = await tx
      .select({ correction: attendanceCorrections, managerId: employees.managerId })
      .from(attendanceCorrections)
      .innerJoin(employees, eq(attendanceCorrections.employeeId, employees.id))
      .where(eq(attendanceCorrections.id, id));
    if (!existing) return { error: "NOT_FOUND" as const };

    const ownership = { isSelf: existing.correction.employeeId === employeeId, isDirectReport: existing.managerId === employeeId };
    if (!can(auth, "attendance.correct", ownership)) return { error: "FORBIDDEN" as const };
    if (existing.correction.status !== "pending") {
      return { error: "INVALID_TRANSITION" as const, status: existing.correction.status };
    }

    const [row] = await tx
      .update(attendanceCorrections)
      .set({
        status: targetStatus,
        approverId: employeeId,
        decidedAt: new Date(),
        decisionNote: parsed.data.reason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(attendanceCorrections.id, id))
      .returning();

    if (targetStatus === "approved") {
      const correction = existing.correction;
      const [existingRecord] = await tx
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.tenantId, auth.tenantId),
            eq(attendanceRecords.employeeId, correction.employeeId),
            eq(attendanceRecords.workDate, correction.workDate),
          ),
        );

      const newClockIn = correction.requestedClockIn ?? existingRecord?.clockIn ?? null;
      const newClockOut = correction.requestedClockOut ?? existingRecord?.clockOut ?? null;
      const newStatus = correction.requestedStatus ?? existingRecord?.status ?? "present";
      const shift = await resolveActiveShift(tx, auth.tenantId, correction.employeeId, correction.workDate);
      const lateMinutes = newClockIn
        ? computeLateMinutes(shift, correction.workDate, newClockIn)
        : (existingRecord?.lateMinutes ?? 0);
      const overtimeMinutes = newClockOut
        ? computeOvertimeMinutes(shift, correction.workDate, newClockOut)
        : (existingRecord?.overtimeMinutes ?? 0);

      if (existingRecord) {
        await tx
          .update(attendanceRecords)
          .set({
            clockIn: newClockIn,
            clockOut: newClockOut,
            status: newStatus,
            lateMinutes,
            overtimeMinutes,
            isCorrected: true,
            updatedAt: new Date(),
          })
          .where(eq(attendanceRecords.id, existingRecord.id));
      } else {
        await tx.insert(attendanceRecords).values({
          tenantId: auth.tenantId,
          employeeId: correction.employeeId,
          workDate: correction.workDate,
          clockIn: newClockIn,
          clockOut: newClockOut,
          status: newStatus,
          source: "manual",
          lateMinutes,
          overtimeMinutes,
          isCorrected: true,
        });
      }
    }

    return { row: row! };
  });

  if ("error" in result) {
    if (result.error === "NOT_FOUND") return notFound(c, "Correction request");
    if (result.error === "FORBIDDEN") return forbidden(c);
    return fail(c, 409, "INVALID_TRANSITION", `Cannot decide a request that is already ${result.status}.`);
  }
  return ok(c, serializeCorrection(result.row));
}

export function correctionsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "attendance.request_correction") || !auth.employeeId) return forbidden(c);

    const parsed = applyCorrectionSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid correction payload", parsed.error.flatten());
    const { workDate, requestedClockIn, requestedClockOut, requestedStatus, reason } = parsed.data;

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .insert(attendanceCorrections)
        .values({
          tenantId: auth.tenantId,
          employeeId: auth.employeeId as string,
          workDate,
          requestedClockIn: requestedClockIn ? new Date(requestedClockIn) : null,
          requestedClockOut: requestedClockOut ? new Date(requestedClockOut) : null,
          requestedStatus: requestedStatus ?? null,
          reason: reason ?? null,
          status: "pending",
        })
        .returning(),
    );
    return ok(c, serializeCorrection(row!), 201);
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { work_date: attendanceCorrections.workDate, created_at: attendanceCorrections.createdAt }, attendanceCorrections.workDate);
    const status = c.req.query("status");

    const db = getDb(c.env.APP_DATABASE_URL);
    const { rows, total } = await withTenant(db, auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      const filters = [
        status ? eq(attendanceCorrections.status, status) : undefined,
        visibleIds === null ? undefined : visibleIds.length > 0 ? inArray(attendanceCorrections.employeeId, visibleIds) : sql`false`,
      ].filter((clause): clause is NonNullable<typeof clause> => clause !== undefined);
      const where = filters.length > 0 ? and(...filters) : undefined;

      const [rows, countRows] = await Promise.all([
        tx.select().from(attendanceCorrections).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(attendanceCorrections).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows.map(serializeCorrection), { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const db = getDb(c.env.APP_DATABASE_URL);

    const [row] = await withTenant(db, auth.tenantId, (tx) =>
      tx
        .select({ correction: attendanceCorrections, managerId: employees.managerId })
        .from(attendanceCorrections)
        .innerJoin(employees, eq(attendanceCorrections.employeeId, employees.id))
        .where(eq(attendanceCorrections.id, id)),
    );
    if (!row) return notFound(c, "Correction request");

    const isSelf = row.correction.employeeId === auth.employeeId;
    const ownership = { isSelf, isDirectReport: row.managerId === auth.employeeId };
    if (!isSelf && !can(auth, "attendance.correct", ownership)) return forbidden(c);

    return ok(c, serializeCorrection(row.correction));
  });

  // Self-only, and only while still pending.
  app.patch("/:id/cancel", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const db = getDb(c.env.APP_DATABASE_URL);

    const result = await withTenant(db, auth.tenantId, async (tx) => {
      const [existing] = await tx.select().from(attendanceCorrections).where(eq(attendanceCorrections.id, id));
      if (!existing) return { error: "NOT_FOUND" as const };
      if (existing.employeeId !== auth.employeeId) return { error: "FORBIDDEN" as const };
      if (existing.status !== "pending") return { error: "INVALID_TRANSITION" as const, status: existing.status };

      const [row] = await tx
        .update(attendanceCorrections)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(attendanceCorrections.id, id))
        .returning();
      return { row: row! };
    });

    if ("error" in result) {
      if (result.error === "NOT_FOUND") return notFound(c, "Correction request");
      if (result.error === "FORBIDDEN") return forbidden(c, "You can only cancel your own correction requests.");
      return fail(c, 409, "INVALID_TRANSITION", `Cannot cancel a request that is already ${result.status}.`);
    }
    return ok(c, serializeCorrection(result.row));
  });

  app.patch("/:id/approve", (c) => decide(c, "approved"));
  app.patch("/:id/reject", (c) => decide(c, "rejected"));

  return app;
}
