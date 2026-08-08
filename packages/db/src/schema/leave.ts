import { boolean, date, index, jsonb, numeric, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { tenants } from "./platform";
import { employees, branches } from "./core";

export const leaveTypes = pgTable("leave_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(), // Casual, Sick, Earned, Comp-Off
  isPaid: boolean("is_paid").notNull().default(true),
  accrualRule: jsonb("accrual_rule"), // e.g. { "per": "month", "days": 1.5 }
  ...timestamps,
});

export const leaveBalances = pgTable(
  "leave_balances",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id),
    year: smallint("year").notNull(),
    entitled: numeric("entitled", { precision: 6, scale: 2 }).notNull().default("0"),
    used: numeric("used", { precision: 6, scale: 2 }).notNull().default("0"),
    carriedForward: numeric("carried_forward", { precision: 6, scale: 2 }).notNull().default("0"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tenantId, table.employeeId, table.leaveTypeId, table.year] }),
  }),
);

export const leaveRequests = pgTable(
  "leave_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    leaveTypeId: uuid("leave_type_id")
      .notNull()
      .references(() => leaveTypes.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    days: numeric("days", { precision: 4, scale: 2 }).notNull(),
    reason: text("reason"),
    status: text("status").notNull().default("pending"), // pending | approved | rejected | cancelled
    approverId: uuid("approver_id").references(() => employees.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    tenantStatusIdx: index("idx_leave_requests_tenant_status").on(table.tenantId, table.status),
  }),
);

export const holidayCalendar = pgTable("holiday_calendar", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  branchId: uuid("branch_id").references(() => branches.id), // null = applies to all branches
  name: text("name").notNull(),
  date: date("date").notNull(),
});
