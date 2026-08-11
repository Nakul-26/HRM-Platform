import { and, eq, gte, lte } from "drizzle-orm";
import { schema, type Database } from "@hrm/db";
import type { PayComponentType, PayrollTaxConfig, PayslipBreakdown, PayslipLineItem, SalaryComponentLine, TaxSlab } from "@hrm/types";
import { enumerateBusinessDays, fetchHolidayDates } from "./businessDays";

const { attendanceRecords, leaveBalances, leaveTypes } = schema;

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** `month` is 1-based (1 = January). `Date.UTC(year, month, 0)` rolls back to the last day of the *previous* 0-based month, which — since `month` here is already 1-based — is exactly the last day of `month` itself. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function periodBounds(year: number, month: number): { startDate: string; endDate: string; calendarDays: number } {
  const calendarDays = daysInMonth(year, month);
  return {
    startDate: `${year}-${pad2(month)}-01`,
    endDate: `${year}-${pad2(month)}-${pad2(calendarDays)}`,
    calendarDays,
  };
}

/** Row-level numeric columns come back as strings from the Postgres driver — convert once at the boundary. */
export function toPayrollTaxConfig(row: typeof schema.payrollTaxConfig.$inferSelect): PayrollTaxConfig {
  return {
    tenantId: row.tenantId,
    pfEmployeeRate: Number(row.pfEmployeeRate),
    pfEmployerRate: Number(row.pfEmployerRate),
    pfWageCeiling: row.pfWageCeiling === null ? null : Number(row.pfWageCeiling),
    esiEmployeeRate: Number(row.esiEmployeeRate),
    esiEmployerRate: Number(row.esiEmployerRate),
    esiWageThreshold: Number(row.esiWageThreshold),
    standardDeduction: Number(row.standardDeduction),
    cessRate: Number(row.cessRate),
    taxSlabs: row.taxSlabs as TaxSlab[],
  };
}

export function toPayComponentType(row: typeof schema.payComponentTypes.$inferSelect): PayComponentType {
  return {
    id: row.id,
    tenantId: row.tenantId,
    code: row.code,
    name: row.name,
    category: row.category as PayComponentType["category"],
    calculationType: row.calculationType as PayComponentType["calculationType"],
    isTaxable: row.isTaxable,
  };
}

export interface GrossEarningsResult {
  basic: number;
  grossEarnings: number;
  earningLines: PayslipLineItem[];
  deductionLines: PayslipLineItem[];
}

/**
 * Resolves `basic` first, then any `percentage_of_basic` components off it,
 * and sums `category: "earning"` lines into `grossEarnings`. `category:
 * "deduction"` lines (e.g. a configured loan-recovery component) are kept
 * separate — they land in the payslip's `otherDeductions`, not statutory.
 * A component code with no matching type (e.g. a since-deleted type still
 * referenced by an old structure) is skipped rather than throwing.
 */
export function computeGrossEarnings(components: SalaryComponentLine[], componentTypes: PayComponentType[]): GrossEarningsResult {
  const typeByCode = new Map(componentTypes.map((t) => [t.code, t]));
  const basic = components.find((c) => c.code === "basic")?.amount ?? 0;

  const earningLines: PayslipLineItem[] = [];
  const deductionLines: PayslipLineItem[] = [];
  let grossEarnings = 0;

  for (const line of components) {
    const type = typeByCode.get(line.code);
    if (!type) continue;
    const amount = type.calculationType === "percentage_of_basic" ? round2(basic * (line.amount / 100)) : line.amount;
    if (type.category === "earning") {
      earningLines.push({ code: type.code, label: type.name, amount });
      grossEarnings += amount;
    } else {
      deductionLines.push({ code: type.code, label: type.name, amount });
    }
  }

  return { basic, grossEarnings: round2(grossEarnings), earningLines, deductionLines };
}

export interface AttendanceDayStatus {
  status: string | null;
}

export interface LopResult {
  workingDays: number;
  lopDays: number;
  lopDeduction: number;
  payableGrossEarnings: number;
}

/**
 * Per-day rate = grossEarnings / calendar days in the month (the common
 * India-payroll convention — documented choice, not the only valid one).
 * `present`/`on_leave`/`holiday` are fully payable; `half_day` is half a
 * day's LOP; anything else (`absent`, or no attendance record at all on a
 * working day) is a full day's LOP.
 */
export function computeLop(dayStatuses: AttendanceDayStatus[], calendarDaysInMonth: number, grossEarnings: number): LopResult {
  const workingDays = dayStatuses.length;
  let lopDays = 0;
  for (const day of dayStatuses) {
    if (day.status === "present" || day.status === "on_leave" || day.status === "holiday") continue;
    if (day.status === "half_day") {
      lopDays += 0.5;
    } else {
      lopDays += 1;
    }
  }

  const perDayRate = calendarDaysInMonth > 0 ? grossEarnings / calendarDaysInMonth : 0;
  const lopDeduction = round2(perDayRate * lopDays);
  const payableGrossEarnings = round2(grossEarnings - lopDeduction);
  return { workingDays, lopDays, lopDeduction, payableGrossEarnings };
}

function computeSlabTax(taxableIncome: number, slabs: TaxSlab[]): number {
  let tax = 0;
  let lowerBound = 0;
  for (const slab of slabs) {
    if (taxableIncome <= lowerBound) break;
    const upperBound = slab.upTo ?? Number.POSITIVE_INFINITY;
    const amountInSlab = Math.min(taxableIncome, upperBound) - lowerBound;
    tax += amountInSlab * slab.rate;
    lowerBound = upperBound;
    if (taxableIncome <= upperBound) break;
  }
  return tax;
}

export interface StatutoryResult {
  pfEmployee: number;
  pfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  tds: number;
}

/**
 * PF is computed off `basic` (wage-ceiling aware — `null` ceiling means
 * apply to full basic, a common private-sector practice; a configured
 * ceiling caps it at the statutory wage limit). ESI is all-or-nothing based
 * on `payableGrossEarnings` against `esiWageThreshold`. TDS annualizes
 * `payableGrossEarnings`, subtracts the standard deduction, runs the result
 * through configurable slabs, adds cess, and spreads flatly over 12 months
 * — deliberately simplified (no exemption stacking, no mid-year true-up;
 * see docs discussion / plan).
 */
export function computeStatutory(payableGrossEarnings: number, payableBasic: number, taxConfig: PayrollTaxConfig): StatutoryResult {
  const pfWage = taxConfig.pfWageCeiling != null ? Math.min(payableBasic, taxConfig.pfWageCeiling) : payableBasic;
  const pfEmployee = round2(pfWage * taxConfig.pfEmployeeRate);
  const pfEmployer = round2(pfWage * taxConfig.pfEmployerRate);

  const esiApplicable = payableGrossEarnings > 0 && payableGrossEarnings <= taxConfig.esiWageThreshold;
  const esiEmployee = esiApplicable ? round2(payableGrossEarnings * taxConfig.esiEmployeeRate) : 0;
  const esiEmployer = esiApplicable ? round2(payableGrossEarnings * taxConfig.esiEmployerRate) : 0;

  const annualGross = payableGrossEarnings * 12;
  const annualTaxable = Math.max(0, annualGross - taxConfig.standardDeduction);
  const annualTax = computeSlabTax(annualTaxable, taxConfig.taxSlabs);
  const annualTaxWithCess = annualTax * (1 + taxConfig.cessRate);
  const tds = round2(annualTaxWithCess / 12);

  return { pfEmployee, pfEmployer, esiEmployee, esiEmployer, tds };
}

/**
 * Only meaningful when `dateOfExit` falls inside the payroll period —
 * sums the employee's remaining balance (`entitled + carriedForward -
 * used`) across `isPaid` leave types for `year` and converts it to a
 * one-off earning at `perDayRate`. Returns `null` when there's nothing to
 * encash. Full leave-encashment *request* workflows (outside of exit) are
 * out of scope — this only covers the final-settlement case.
 */
export async function computeFinalSettlementEncashment(
  tx: Database,
  tenantId: string,
  employeeId: string,
  year: number,
  perDayRate: number,
): Promise<PayslipLineItem | null> {
  const rows = await tx
    .select({ entitled: leaveBalances.entitled, used: leaveBalances.used, carriedForward: leaveBalances.carriedForward })
    .from(leaveBalances)
    .innerJoin(leaveTypes, eq(leaveBalances.leaveTypeId, leaveTypes.id))
    .where(
      and(
        eq(leaveBalances.tenantId, tenantId),
        eq(leaveBalances.employeeId, employeeId),
        eq(leaveBalances.year, year),
        eq(leaveTypes.isPaid, true),
      ),
    );

  const remainingDays = rows.reduce(
    (sum, r) => sum + Math.max(0, Number(r.entitled) + Number(r.carriedForward) - Number(r.used)),
    0,
  );
  if (remainingDays <= 0) return null;

  return {
    code: "leave_encashment",
    label: `Leave Encashment (${remainingDays} day${remainingDays === 1 ? "" : "s"})`,
    amount: round2(remainingDays * perDayRate),
  };
}

export interface CalculatePayslipResult {
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  breakdown: PayslipBreakdown;
}

/** Orchestrates the whole calculation for one employee/period. Returns `null` if the employee has no salary structure effective by the period's end date — such employees are skipped by the run, not failed. */
export async function calculatePayslip(
  tx: Database,
  tenantId: string,
  employee: { id: string; branchId: string | null; dateOfExit: string | null },
  structure: { components: unknown },
  componentTypes: PayComponentType[],
  taxConfig: PayrollTaxConfig,
  periodMonth: number,
  periodYear: number,
): Promise<CalculatePayslipResult> {
  const { startDate, endDate, calendarDays } = periodBounds(periodYear, periodMonth);

  const { basic, grossEarnings, earningLines, deductionLines } = computeGrossEarnings(
    structure.components as SalaryComponentLine[],
    componentTypes,
  );

  const holidayDates = await fetchHolidayDates(tx, tenantId, employee.branchId, startDate, endDate);
  const businessDays = enumerateBusinessDays(startDate, endDate, holidayDates);

  const attendanceRows = await tx
    .select({ workDate: attendanceRecords.workDate, status: attendanceRecords.status })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.tenantId, tenantId),
        eq(attendanceRecords.employeeId, employee.id),
        gte(attendanceRecords.workDate, startDate),
        lte(attendanceRecords.workDate, endDate),
      ),
    );
  const statusByDate = new Map(attendanceRows.map((r) => [r.workDate, r.status]));
  const dayStatuses: AttendanceDayStatus[] = businessDays.map((d) => ({ status: statusByDate.get(d) ?? null }));

  const { workingDays, lopDays, lopDeduction, payableGrossEarnings } = computeLop(dayStatuses, calendarDays, grossEarnings);
  const payableFraction = grossEarnings > 0 ? payableGrossEarnings / grossEarnings : 1;
  const statutory = computeStatutory(payableGrossEarnings, basic * payableFraction, taxConfig);

  const earnings = [...earningLines];
  if (employee.dateOfExit && employee.dateOfExit >= startDate && employee.dateOfExit <= endDate) {
    const perDayRate = calendarDays > 0 ? grossEarnings / calendarDays : 0;
    const encashment = await computeFinalSettlementEncashment(tx, tenantId, employee.id, periodYear, perDayRate);
    if (encashment) earnings.push(encashment);
  }

  const statutoryDeductions: PayslipLineItem[] = [
    { code: "pf_employee", label: "Provident Fund (Employee)", amount: statutory.pfEmployee },
    { code: "esi_employee", label: "ESI (Employee)", amount: statutory.esiEmployee },
    { code: "tds", label: "Income Tax (TDS)", amount: statutory.tds },
  ];
  const otherDeductions: PayslipLineItem[] = [
    ...(lopDays > 0 ? [{ code: "lop", label: `Loss of Pay (${lopDays} day${lopDays === 1 ? "" : "s"})`, amount: lopDeduction }] : []),
    ...deductionLines,
  ];
  const employerContributions: PayslipLineItem[] = [
    { code: "pf_employer", label: "Provident Fund (Employer)", amount: statutory.pfEmployer },
    { code: "esi_employer", label: "ESI (Employer)", amount: statutory.esiEmployer },
  ];

  const totalEarnings = round2(earnings.reduce((sum, l) => sum + l.amount, 0));
  const totalDeductions = round2(
    statutoryDeductions.reduce((sum, l) => sum + l.amount, 0) + otherDeductions.reduce((sum, l) => sum + l.amount, 0),
  );

  return {
    grossEarnings: totalEarnings,
    totalDeductions,
    netPay: round2(totalEarnings - totalDeductions),
    breakdown: { earnings, statutoryDeductions, otherDeductions, employerContributions, workingDays, lopDays },
  };
}
