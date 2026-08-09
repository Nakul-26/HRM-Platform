"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export async function clockInAction() {
  const result = await gatewayFetch("/api/v1/attendance/records/clock-in", { method: "POST" });
  if (result.ok) revalidatePath("/attendance");
  return { ok: result.ok, error: result.error?.message };
}

export async function clockOutAction() {
  const result = await gatewayFetch("/api/v1/attendance/records/clock-out", { method: "POST" });
  if (result.ok) revalidatePath("/attendance");
  return { ok: result.ok, error: result.error?.message };
}

export interface ApplyCorrectionState {
  error?: string;
  success?: boolean;
}

export async function applyCorrectionAction(_prev: ApplyCorrectionState, formData: FormData): Promise<ApplyCorrectionState> {
  const workDate = String(formData.get("workDate") ?? "");
  const requestedClockInTime = String(formData.get("requestedClockInTime") ?? "").trim();
  const requestedClockOutTime = String(formData.get("requestedClockOutTime") ?? "").trim();
  const requestedStatus = String(formData.get("requestedStatus") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  if (!workDate) return { error: "Work date is required." };
  if (!requestedClockInTime && !requestedClockOutTime && !requestedStatus) {
    return { error: "Provide at least one corrected clock-in, clock-out, or status." };
  }

  const body: Record<string, unknown> = { workDate };
  if (requestedClockInTime) body.requestedClockIn = new Date(`${workDate}T${requestedClockInTime}:00Z`).toISOString();
  if (requestedClockOutTime) body.requestedClockOut = new Date(`${workDate}T${requestedClockOutTime}:00Z`).toISOString();
  if (requestedStatus) body.requestedStatus = requestedStatus;
  if (reason) body.reason = reason;

  const result = await gatewayFetch("/api/v1/attendance/corrections", { method: "POST", body });
  if (!result.ok) return { error: result.error?.message ?? "Could not submit correction request." };

  revalidatePath("/attendance");
  return { success: true };
}

export async function cancelCorrectionAction(id: string) {
  await gatewayFetch(`/api/v1/attendance/corrections/${id}/cancel`, { method: "PATCH" });
  revalidatePath("/attendance");
}
