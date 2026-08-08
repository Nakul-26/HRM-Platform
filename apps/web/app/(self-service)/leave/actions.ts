"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface ApplyLeaveState {
  error?: string;
  success?: boolean;
}

export async function applyLeaveAction(_prev: ApplyLeaveState, formData: FormData): Promise<ApplyLeaveState> {
  const leaveTypeId = String(formData.get("leaveTypeId") ?? "");
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!leaveTypeId || !startDate || !endDate) return { error: "Leave type and both dates are required." };

  const body: Record<string, string> = { leaveTypeId, startDate, endDate };
  if (reason) body.reason = reason;

  const result = await gatewayFetch("/api/v1/leave/requests", { method: "POST", body });
  if (!result.ok) return { error: result.error?.message ?? "Could not submit leave request." };

  revalidatePath("/leave");
  return { success: true };
}

export async function cancelLeaveAction(id: string) {
  await gatewayFetch(`/api/v1/leave/requests/${id}/cancel`, { method: "PATCH" });
  revalidatePath("/leave");
}
