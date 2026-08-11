"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface SalaryStructureActionState {
  error?: string;
}

const COMPONENT_ROWS = 5;

export async function createSalaryStructureAction(
  _prev: SalaryStructureActionState,
  formData: FormData,
): Promise<SalaryStructureActionState> {
  const employeeId = String(formData.get("employeeId") ?? "");
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "");
  if (!employeeId || !effectiveFrom) return { error: "Employee and effective-from date are required." };

  const components = Array.from({ length: COMPONENT_ROWS }, (_, i) => ({
    code: String(formData.get(`componentCode${i}`) ?? "").trim(),
    amount: Number.parseFloat(String(formData.get(`componentAmount${i}`) ?? "")),
  })).filter((c) => c.code && Number.isFinite(c.amount));

  if (components.length === 0) return { error: "At least one component with an amount is required." };

  const result = await gatewayFetch("/api/v1/payroll/salary-structures", {
    method: "POST",
    body: { employeeId, effectiveFrom, components },
  });
  if (!result.ok) return { error: result.error?.message ?? "Could not create salary structure." };

  revalidatePath("/payroll/salary-structures");
  return {};
}
