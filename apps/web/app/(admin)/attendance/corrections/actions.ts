"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export async function approveCorrectionAction(id: string) {
  const result = await gatewayFetch(`/api/v1/attendance/corrections/${id}/approve`, { method: "PATCH" });
  if (result.ok) revalidatePath("/attendance/corrections");
  return { ok: result.ok, error: result.error?.message };
}

export async function rejectCorrectionAction(id: string, reason: string) {
  const body = reason ? { reason } : {};
  const result = await gatewayFetch(`/api/v1/attendance/corrections/${id}/reject`, { method: "PATCH", body });
  if (result.ok) revalidatePath("/attendance/corrections");
  return { ok: result.ok, error: result.error?.message };
}
