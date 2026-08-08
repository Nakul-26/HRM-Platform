import { date, jsonb, numeric, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { tenants } from "./platform";
import { employees } from "./core";

export const salaryStructures = pgTable("salary_structures", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id),
  effectiveFrom: date("effective_from").notNull(),
  components: jsonb("components").notNull(), // [{ "type": "basic", "amount": 50000 }, ...]
  ...timestamps,
});

export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    periodMonth: smallint("period_month").notNull(),
    periodYear: smallint("period_year").notNull(),
    status: text("status").notNull().default("draft"), // draft | processing | completed | failed
    processedAt: timestamp("processed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => ({
    tenantPeriodUnique: unique("payroll_runs_tenant_period_unique").on(table.tenantId, table.periodMonth, table.periodYear),
  }),
);

export const payslips = pgTable(
  "payslips",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    payrollRunId: uuid("payroll_run_id")
      .notNull()
      .references(() => payrollRuns.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    grossEarnings: numeric("gross_earnings", { precision: 12, scale: 2 }).notNull(),
    totalDeductions: numeric("total_deductions", { precision: 12, scale: 2 }).notNull(),
    netPay: numeric("net_pay", { precision: 12, scale: 2 }).notNull(),
    // Full earnings/deductions/tax/PF/ESI line items — denormalized since payslips are
    // immutable once generated (docs/architecture/04-database-design.md).
    breakdown: jsonb("breakdown").notNull(),
    r2ObjectKey: text("r2_object_key"), // generated PDF
    ...timestamps,
  },
  (table) => ({
    tenantRunEmployeeUnique: unique("payslips_tenant_run_employee_unique").on(
      table.tenantId,
      table.payrollRunId,
      table.employeeId,
    ),
  }),
);
