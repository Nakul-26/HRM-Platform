"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface PayrollRunActionState {
  error?: string;
}

export async function createPayrollRunAction(_prev: PayrollRunActionState, formData: FormData): Promise<PayrollRunActionState> {
  const periodMonth = Number.parseInt(String(formData.get("periodMonth") ?? ""), 10);
  const periodYear = Number.parseInt(String(formData.get("periodYear") ?? ""), 10);
  if (!Number.isFinite(periodMonth) || !Number.isFinite(periodYear)) return { error: "Month and year are required." };

  const result = await gatewayFetch("/api/v1/payroll/runs", { method: "POST", body: { periodMonth, periodYear } });
  if (!result.ok) return { error: result.error?.message ?? "Could not create payroll run." };

  revalidatePath("/payroll/runs");
  return {};
}

export async function executePayrollRunAction(id: string) {
  const result = await gatewayFetch(`/api/v1/payroll/runs/${id}/execute`, { method: "POST" });
  if (result.ok) revalidatePath(`/payroll/runs/${id}`);
  return { ok: result.ok, error: result.error?.message };
}
