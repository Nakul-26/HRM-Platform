import { z } from "zod";

export const payComponentCategorySchema = z.enum(["earning", "deduction"]);
export type PayComponentCategory = z.infer<typeof payComponentCategorySchema>;

export const payComponentCalculationTypeSchema = z.enum(["fixed", "percentage_of_basic"]);
export type PayComponentCalculationType = z.infer<typeof payComponentCalculationTypeSchema>;

export const payComponentTypeSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  category: payComponentCategorySchema,
  calculationType: payComponentCalculationTypeSchema,
  isTaxable: z.boolean(),
});
export type PayComponentType = z.infer<typeof payComponentTypeSchema>;

export const createPayComponentTypeSchema = payComponentTypeSchema
  .pick({ code: true, name: true, category: true })
  .extend({
    calculationType: payComponentCalculationTypeSchema.optional(),
    isTaxable: z.boolean().optional(),
  });
export type CreatePayComponentTypeInput = z.infer<typeof createPayComponentTypeSchema>;
export const updatePayComponentTypeSchema = createPayComponentTypeSchema.partial();
export type UpdatePayComponentTypeInput = z.infer<typeof updatePayComponentTypeSchema>;

/** One line in a salary structure — `amount` is a fixed rupee value, or percentage points of basic if the referenced component type is `percentage_of_basic`. */
export const salaryComponentLineSchema = z.object({
  code: z.string().min(1),
  amount: z.number(),
});
export type SalaryComponentLine = z.infer<typeof salaryComponentLineSchema>;

export const salaryStructureSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  effectiveFrom: z.string(), // ISO date (YYYY-MM-DD)
  components: z.array(salaryComponentLineSchema),
});
export type SalaryStructure = z.infer<typeof salaryStructureSchema>;

export const createSalaryStructureSchema = z.object({
  employeeId: z.string().uuid(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  components: z.array(salaryComponentLineSchema).min(1),
});
export type CreateSalaryStructureInput = z.infer<typeof createSalaryStructureSchema>;

/** `upTo: null` marks the top (unbounded) slab. Amounts are annual, in the tenant's base currency unit. */
export const taxSlabSchema = z.object({
  upTo: z.number().positive().nullable(),
  rate: z.number().min(0).max(1),
});
export type TaxSlab = z.infer<typeof taxSlabSchema>;

export const payrollTaxConfigSchema = z.object({
  tenantId: z.string().uuid(),
  pfEmployeeRate: z.number().min(0).max(1),
  pfEmployerRate: z.number().min(0).max(1),
  pfWageCeiling: z.number().positive().nullable(),
  esiEmployeeRate: z.number().min(0).max(1),
  esiEmployerRate: z.number().min(0).max(1),
  esiWageThreshold: z.number().positive(),
  standardDeduction: z.number().min(0),
  cessRate: z.number().min(0).max(1),
  taxSlabs: z.array(taxSlabSchema).min(1),
});
export type PayrollTaxConfig = z.infer<typeof payrollTaxConfigSchema>;

export const updatePayrollTaxConfigSchema = payrollTaxConfigSchema.omit({ tenantId: true }).partial();
export type UpdatePayrollTaxConfigInput = z.infer<typeof updatePayrollTaxConfigSchema>;

export const payrollRunStatusSchema = z.enum(["draft", "processing", "completed", "failed"]);
export type PayrollRunStatus = z.infer<typeof payrollRunStatusSchema>;

export const payrollRunSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000).max(2100),
  status: payrollRunStatusSchema,
  processedAt: z.string().nullable(),
});
export type PayrollRun = z.infer<typeof payrollRunSchema>;

export const createPayrollRunSchema = z.object({
  periodMonth: z.number().int().min(1).max(12),
  periodYear: z.number().int().min(2000).max(2100),
});
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;

const lineItemSchema = z.object({
  code: z.string(),
  label: z.string(),
  amount: z.number(),
});
export type PayslipLineItem = z.infer<typeof lineItemSchema>;

export const payslipBreakdownSchema = z.object({
  earnings: z.array(lineItemSchema), // salary-structure earning components + one-off final-settlement leave encashment, if any
  statutoryDeductions: z.array(lineItemSchema), // PF/ESI (employee share) + TDS — always present, even at 0, for transparency
  otherDeductions: z.array(lineItemSchema), // loss-of-pay + custom deduction components (e.g. loan recovery)
  employerContributions: z.array(lineItemSchema), // PF/ESI employer share — reporting only, does not affect net pay
  workingDays: z.number(),
  lopDays: z.number(),
});
export type PayslipBreakdown = z.infer<typeof payslipBreakdownSchema>;

export const payslipSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  payrollRunId: z.string().uuid(),
  employeeId: z.string().uuid(),
  periodMonth: z.number().int().min(1).max(12), // denormalized from the parent payroll_runs row — every payslip route joins it in, since a payslip with no visible period is unusable
  periodYear: z.number().int(),
  grossEarnings: z.number(), // Postgres `numeric` column — routes convert the driver's string return to a number before responding.
  totalDeductions: z.number(),
  netPay: z.number(),
  breakdown: payslipBreakdownSchema,
  r2ObjectKey: z.string().nullable(),
});
export type Payslip = z.infer<typeof payslipSchema>;
