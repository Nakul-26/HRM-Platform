import { bigserial, boolean, date, index, integer, pgTable, smallint, text, time, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { tenants } from "./platform";
import { employees } from "./core";

export const shiftTemplates = pgTable("shift_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  isNightShift: boolean("is_night_shift").notNull().default(false),
  graceMinutes: smallint("grace_minutes").notNull().default(0),
  ...timestamps,
});

export const employeeShiftAssignments = pgTable("employee_shift_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id),
  shiftTemplateId: uuid("shift_template_id")
    .notNull()
    .references(() => shiftTemplates.id),
  effectiveFrom: date("effective_from").notNull(),
  effectiveTo: date("effective_to"),
  ...timestamps,
});

/**
 * Monthly range-partitioned by work_date (migration 0002) — this is the
 * highest-write-volume table in the schema (docs/architecture/04-database-design.md).
 */
export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    workDate: date("work_date").notNull(),
    clockIn: timestamp("clock_in", { withTimezone: true }),
    clockOut: timestamp("clock_out", { withTimezone: true }),
    source: text("source").notNull(), // biometric | manual | mobile | web
    status: text("status").notNull(), // present | absent | half_day | on_leave | holiday
    lateMinutes: integer("late_minutes").notNull().default(0),
    overtimeMinutes: integer("overtime_minutes").notNull().default(0),
    isCorrected: boolean("is_corrected").notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    tenantEmployeeDateUnique: unique("attendance_tenant_employee_date_unique").on(
      table.tenantId,
      table.employeeId,
      table.workDate,
    ),
    tenantDateIdx: index("idx_attendance_tenant_date").on(table.tenantId, table.workDate),
  }),
);

/**
 * Employee-initiated request to correct a day's attendance (missed clock-in/out,
 * wrong status, etc.) — approved via the same permission-scoped decide() pattern
 * as leave requests (`attendance.correct` / `attendance.correct_all`), never by
 * directly editing `attendanceRecords`.
 */
export const attendanceCorrections = pgTable("attendance_corrections", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id),
  workDate: date("work_date").notNull(),
  requestedClockIn: timestamp("requested_clock_in", { withTimezone: true }),
  requestedClockOut: timestamp("requested_clock_out", { withTimezone: true }),
  requestedStatus: text("requested_status"), // present | absent | half_day
  reason: text("reason"),
  status: text("status").notNull().default("pending"), // pending | approved | rejected | cancelled
  approverId: uuid("approver_id").references(() => employees.id),
  decisionNote: text("decision_note"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  ...timestamps,
});
