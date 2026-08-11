import { describe, expect, it } from "vitest";
import type { PayComponentType, PayrollTaxConfig } from "@hrm/types";
import { computeGrossEarnings, computeLop, computeStatutory, daysInMonth, periodBounds } from "./payrollEngine";

const componentTypes: PayComponentType[] = [
  { id: "1", tenantId: "t", code: "basic", name: "Basic", category: "earning", calculationType: "fixed", isTaxable: true },
  { id: "2", tenantId: "t", code: "hra", name: "HRA", category: "earning", calculationType: "fixed", isTaxable: true },
  {
    id: "3",
    tenantId: "t",
    code: "special_allowance",
    name: "Special Allowance",
    category: "earning",
    calculationType: "fixed",
    isTaxable: true,
  },
  {
    id: "4",
    tenantId: "t",
    code: "hra_pct",
    name: "HRA (% of basic)",
    category: "earning",
    calculationType: "percentage_of_basic",
    isTaxable: true,
  },
  { id: "5", tenantId: "t", code: "loan_recovery", name: "Loan Recovery", category: "deduction", calculationType: "fixed", isTaxable: false },
];

// New-regime-style default slabs, same shape seeded at tenant creation (packages/db/src/onboarding.ts).
const taxConfig: PayrollTaxConfig = {
  tenantId: "t",
  pfEmployeeRate: 0.12,
  pfEmployerRate: 0.12,
  pfWageCeiling: null,
  esiEmployeeRate: 0.0075,
  esiEmployerRate: 0.0325,
  esiWageThreshold: 21000,
  standardDeduction: 75000,
  cessRate: 0.04,
  taxSlabs: [
    { upTo: 300_000, rate: 0 },
    { upTo: 700_000, rate: 0.05 },
    { upTo: 1_000_000, rate: 0.1 },
    { upTo: 1_200_000, rate: 0.15 },
    { upTo: 1_500_000, rate: 0.2 },
    { upTo: null, rate: 0.3 },
  ],
};

describe("computeGrossEarnings", () => {
  it("sums fixed earning components and separates custom deductions", () => {
    const result = computeGrossEarnings(
      [
        { code: "basic", amount: 50_000 },
        { code: "hra", amount: 20_000 },
        { code: "special_allowance", amount: 10_000 },
      ],
      componentTypes,
    );
    expect(result.basic).toBe(50_000);
    expect(result.grossEarnings).toBe(80_000);
    expect(result.earningLines).toHaveLength(3);
    expect(result.deductionLines).toHaveLength(0);
  });

  it("resolves percentage_of_basic components off the basic component", () => {
    const result = computeGrossEarnings(
      [
        { code: "basic", amount: 50_000 },
        { code: "hra_pct", amount: 40 }, // 40% of basic
      ],
      componentTypes,
    );
    expect(result.grossEarnings).toBe(50_000 + 20_000);
    expect(result.earningLines.find((l) => l.code === "hra_pct")?.amount).toBe(20_000);
  });

  it("keeps custom deduction-category components separate from gross earnings", () => {
    const result = computeGrossEarnings(
      [
        { code: "basic", amount: 50_000 },
        { code: "loan_recovery", amount: 2_000 },
      ],
      componentTypes,
    );
    expect(result.grossEarnings).toBe(50_000);
    expect(result.deductionLines).toEqual([{ code: "loan_recovery", label: "Loan Recovery", amount: 2_000 }]);
  });

  it("skips a component code with no matching type rather than throwing", () => {
    const result = computeGrossEarnings([{ code: "basic", amount: 50_000 }, { code: "retired_code", amount: 999 }], componentTypes);
    expect(result.grossEarnings).toBe(50_000);
  });
});

describe("computeLop", () => {
  it("charges zero LOP when every working day is present", () => {
    const days = Array.from({ length: 22 }, () => ({ status: "present" }));
    const result = computeLop(days, 30, 80_000);
    expect(result.workingDays).toBe(22);
    expect(result.lopDays).toBe(0);
    expect(result.lopDeduction).toBe(0);
    expect(result.payableGrossEarnings).toBe(80_000);
  });

  it("treats on_leave and holiday as fully payable", () => {
    const days = [{ status: "present" }, { status: "on_leave" }, { status: "holiday" }];
    const result = computeLop(days, 30, 30_000);
    expect(result.lopDays).toBe(0);
  });

  it("charges a full day of LOP for absent and for a missing record on a working day", () => {
    const days = [{ status: "present" }, { status: "absent" }, { status: null }];
    const result = computeLop(days, 30, 30_000);
    // per-day rate = 30000/30 = 1000; 2 LOP days = 2000
    expect(result.lopDays).toBe(2);
    expect(result.lopDeduction).toBe(2_000);
    expect(result.payableGrossEarnings).toBe(28_000);
  });

  it("charges half a day of LOP for half_day", () => {
    const days = [{ status: "half_day" }];
    const result = computeLop(days, 30, 30_000);
    expect(result.lopDays).toBe(0.5);
    expect(result.lopDeduction).toBe(500);
  });
});

describe("computeStatutory — hand-verified worked example", () => {
  it("Basic 50,000 + HRA 20,000 + Special Allowance 10,000 = Gross 80,000/mo, no LOP", () => {
    // PF: 12% of basic (no ceiling) = 6,000. ESI: gross 80,000 > 21,000 threshold, so 0.
    // TDS: annual gross 960,000 - standard deduction 75,000 = 885,000 taxable.
    //   Slab tax: 0 (0-300k) + 5%*(700k-300k)=20,000 + 10%*(885k-700k)=18,500 => 38,500.
    //   +4% cess => 40,040. Monthly TDS = 40,040/12 = 3,336.67 (rounded).
    const result = computeStatutory(80_000, 50_000, taxConfig);
    expect(result.pfEmployee).toBe(6_000);
    expect(result.pfEmployer).toBe(6_000);
    expect(result.esiEmployee).toBe(0);
    expect(result.esiEmployer).toBe(0);
    expect(result.tds).toBeCloseTo(3_336.67, 2);
  });

  it("applies ESI when payable gross is at or below the wage threshold", () => {
    const result = computeStatutory(18_000, 12_000, taxConfig);
    expect(result.esiEmployee).toBe(135); // 0.75% of 18,000
    expect(result.esiEmployer).toBeCloseTo(585, 2); // 3.25% of 18,000
  });

  it("caps the PF wage at a configured ceiling", () => {
    const capped: PayrollTaxConfig = { ...taxConfig, pfWageCeiling: 15_000 };
    const result = computeStatutory(80_000, 50_000, capped);
    expect(result.pfEmployee).toBe(1_800); // 12% of the 15,000 ceiling, not the full 50,000 basic
  });

  it("charges zero TDS when taxable income is fully absorbed by the standard deduction", () => {
    const result = computeStatutory(6_000, 4_000, taxConfig); // annual gross 72,000 < 75,000 standard deduction
    expect(result.tds).toBe(0);
  });
});

describe("periodBounds / daysInMonth", () => {
  it("computes calendar days and ISO bounds for a 31-day month", () => {
    expect(daysInMonth(2026, 8)).toBe(31);
    expect(periodBounds(2026, 8)).toEqual({ startDate: "2026-08-01", endDate: "2026-08-31", calendarDays: 31 });
  });

  it("computes calendar days for February in a leap year vs. a non-leap year", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });
});
