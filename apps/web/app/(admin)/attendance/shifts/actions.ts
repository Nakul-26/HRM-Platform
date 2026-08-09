"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface ShiftTemplateActionState {
  error?: string;
}

export async function createShiftTemplateAction(_prev: ShiftTemplateActionState, formData: FormData): Promise<ShiftTemplateActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const startTime = String(formData.get("startTime") ?? "");
  const endTime = String(formData.get("endTime") ?? "");
  if (!name || !startTime || !endTime) return { error: "Name, start time, and end time are required." };

  const isNightShift = formData.get("isNightShift") === "on";
  const graceMinutes = Number.parseInt(String(formData.get("graceMinutes") ?? ""), 10);

  const body: Record<string, unknown> = { name, startTime, endTime, isNightShift };
  if (Number.isFinite(graceMinutes) && graceMinutes > 0) body.graceMinutes = graceMinutes;

  const result = await gatewayFetch("/api/v1/attendance/shifts", { method: "POST", body });
  if (!result.ok) return { error: result.error?.message ?? "Could not create shift template." };

  revalidatePath("/attendance/shifts");
  return {};
}

export async function deleteShiftTemplateAction(id: string) {
  await gatewayFetch(`/api/v1/attendance/shifts/${id}`, { method: "DELETE" });
  revalidatePath("/attendance/shifts");
}
