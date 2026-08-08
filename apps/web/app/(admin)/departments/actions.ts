"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface DepartmentActionState {
  error?: string;
}

export async function createDepartmentAction(_prev: DepartmentActionState, formData: FormData): Promise<DepartmentActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const result = await gatewayFetch("/api/v1/departments", { method: "POST", body: { name } });
  if (!result.ok) return { error: result.error?.message ?? "Could not create department." };

  revalidatePath("/departments");
  return {};
}

export async function deleteDepartmentAction(id: string) {
  await gatewayFetch(`/api/v1/departments/${id}`, { method: "DELETE" });
  revalidatePath("/departments");
}
