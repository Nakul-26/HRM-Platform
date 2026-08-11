"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface PayComponentTypeActionState {
  error?: string;
}

export async function createPayComponentTypeAction(
  _prev: PayComponentTypeActionState,
  formData: FormData,
): Promise<PayComponentTypeActionState> {
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "earning");
  if (!code || !name) return { error: "Code and name are required." };

  const body: Record<string, unknown> = {
    code,
    name,
    category,
    calculationType: String(formData.get("calculationType") ?? "fixed"),
    isTaxable: formData.get("isTaxable") === "on",
  };

  const result = await gatewayFetch("/api/v1/payroll/component-types", { method: "POST", body });
  if (!result.ok) return { error: result.error?.message ?? "Could not create pay component type." };

  revalidatePath("/payroll/component-types");
  return {};
}

export async function deletePayComponentTypeAction(id: string) {
  await gatewayFetch(`/api/v1/payroll/component-types/${id}`, { method: "DELETE" });
  revalidatePath("/payroll/component-types");
}
