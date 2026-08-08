"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export async function approveLeaveRequestAction(id: string) {
  const result = await gatewayFetch(`/api/v1/leave/requests/${id}/approve`, { method: "PATCH" });
  if (result.ok) revalidatePath("/leave/approvals");
  return { ok: result.ok, error: result.error?.message };
}

export async function rejectLeaveRequestAction(id: string, reason: string) {
  const body = reason ? { reason } : {};
  const result = await gatewayFetch(`/api/v1/leave/requests/${id}/reject`, { method: "PATCH", body });
  if (result.ok) revalidatePath("/leave/approvals");
  return { ok: result.ok, error: result.error?.message };
}
