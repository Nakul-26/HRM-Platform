"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface HolidayActionState {
  error?: string;
}

export async function createHolidayAction(_prev: HolidayActionState, formData: FormData): Promise<HolidayActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const date = String(formData.get("date") ?? "");
  if (!name || !date) return { error: "Name and date are required." };

  const result = await gatewayFetch("/api/v1/leave/holidays", { method: "POST", body: { name, date } });
  if (!result.ok) return { error: result.error?.message ?? "Could not create holiday." };

  revalidatePath("/leave/holidays");
  return {};
}

export async function deleteHolidayAction(id: string) {
  await gatewayFetch(`/api/v1/leave/holidays/${id}`, { method: "DELETE" });
  revalidatePath("/leave/holidays");
}
