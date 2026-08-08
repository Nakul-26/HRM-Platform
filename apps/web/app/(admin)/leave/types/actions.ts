"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface LeaveTypeActionState {
  error?: string;
}

export async function createLeaveTypeAction(_prev: LeaveTypeActionState, formData: FormData): Promise<LeaveTypeActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const isPaid = formData.get("isPaid") === "on";
  const accrualPer = String(formData.get("accrualPer") ?? "none");
  const accrualDays = Number.parseFloat(String(formData.get("accrualDays") ?? ""));

  const body: Record<string, unknown> = { name, isPaid };
  if (accrualPer !== "none" && Number.isFinite(accrualDays) && accrualDays > 0) {
    body.accrualRule = { per: accrualPer, days: accrualDays };
  }

  const result = await gatewayFetch("/api/v1/leave/types", { method: "POST", body });
  if (!result.ok) return { error: result.error?.message ?? "Could not create leave type." };

  revalidatePath("/leave/types");
  return {};
}

export async function deleteLeaveTypeAction(id: string) {
  await gatewayFetch(`/api/v1/leave/types/${id}`, { method: "DELETE" });
  revalidatePath("/leave/types");
}
