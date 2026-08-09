"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface ShiftAssignmentActionState {
  error?: string;
}

export async function createShiftAssignmentAction(_prev: ShiftAssignmentActionState, formData: FormData): Promise<ShiftAssignmentActionState> {
  const employeeId = String(formData.get("employeeId") ?? "");
  const shiftTemplateId = String(formData.get("shiftTemplateId") ?? "");
  const effectiveFrom = String(formData.get("effectiveFrom") ?? "");
  const effectiveTo = String(formData.get("effectiveTo") ?? "").trim();
  if (!employeeId || !shiftTemplateId || !effectiveFrom) {
    return { error: "Employee, shift, and effective-from date are required." };
  }

  const body: Record<string, unknown> = { employeeId, shiftTemplateId, effectiveFrom };
  if (effectiveTo) body.effectiveTo = effectiveTo;

  const result = await gatewayFetch("/api/v1/attendance/shift-assignments", { method: "POST", body });
  if (!result.ok) return { error: result.error?.message ?? "Could not create shift assignment." };

  revalidatePath("/attendance/shift-assignments");
  return {};
}

export async function deleteShiftAssignmentAction(id: string) {
  await gatewayFetch(`/api/v1/attendance/shift-assignments/${id}`, { method: "DELETE" });
  revalidatePath("/attendance/shift-assignments");
}
