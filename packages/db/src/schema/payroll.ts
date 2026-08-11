import { boolean, date, jsonb, numeric, pgTable, smallint, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { tenants } from "./platform";
import { employees } from "./core";

export const payComponentTypes = pgTable(
  "pay_component_types",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    code: text("code").notNull(), // basic | hra | special_allowance | loan_recovery | ...
    name: text("name").notNull(),
    category: text("category").notNull(), // earning | deduction
    calculationType: text("calculation_type").notNull().default("fixed"), // fixed | percentage_of_basic
    isTaxable: boolean("is_taxable").notNull().default(true),
    ...timestamps,
  },
  (table) => ({
    tenantCodeUnique: unique("pay_component_types_tenant_code_unique").on(table.tenantId, table.code),
  }),
);

// One row per tenant — statutory rates/thresholds the calculation engine reads at run time.
// Seeded with India defaults at tenant creation (packages/db/src/onboarding.ts) so the engine
// never has to handle a missing-config tenant. NOT certified as current-year-accurate statutory
// compliance — real formula shapes with configurable rates, needs review by someone with current
// statutory knowledge before any real payroll run (see plan/docs discussion).
export const payrollTaxConfig = pgTable("payroll_tax_config", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id),
  pfEmployeeRate: numeric("pf_employee_rate", { precision: 5, scale: 4 }).notNull().default("0.12"),
  pfEmployerRate: numeric("pf_employer_rate", { precision: 5, scale: 4 }).notNull().default("0.12"),
  pfWageCeiling: numeric("pf_wage_ceiling", { precision: 12, scale: 2 }), // null = apply to full basic
  esiEmployeeRate: numeric("esi_employee_rate", { precision: 5, scale: 4 }).notNull().default("0.0075"),
  esiEmployerRate: numeric("esi_employer_rate", { precision: 5, scale: 4 }).notNull().default("0.0325"),
  esiWageThreshold: numeric("esi_wage_threshold", { precision: 12, scale: 2 }).notNull().default("21000"),
  standardDeduction: numeric("standard_deduction", { precision: 12, scale: 2 }).notNull().default("75000"),
  cessRate: numeric("cess_rate", { precision: 5, scale: 4 }).notNull().default("0.04"),
  // [{ upTo: 300000, rate: 0 }, { upTo: 700000, rate: 0.05 }, ..., { upTo: null, rate: 0.30 }]
  taxSlabs: jsonb("tax_slabs").notNull(),
  ...timestamps,
});

export const salaryStructures = pgTable(
  "salary_structures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    employeeId: uuid("employee_id")
      .notNull()
      .references(() => employees.id),
    effectiveFrom: date("effective_from").notNull(),
    components: jsonb("components").notNull(), // [{ "code": "basic", "amount": 50000 }, ...]
    ...timestamps,
  },
  (table) => ({
    tenantEmployeeEffectiveUnique: unique("salary_structures_tenant_employee_effective_unique").on(
      table.tenantId,
      table.employeeId,
      table.effectiveFrom,
    ),
  }),
);

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
