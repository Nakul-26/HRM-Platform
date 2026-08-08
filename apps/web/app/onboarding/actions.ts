"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch, importEmployeesCsv } from "@/lib/gateway";

export interface OnboardingActionState {
  error?: string;
  rowErrors?: { row: number; errors: string[] }[] | undefined;
  imported?: number;
}

export async function addDepartmentAction(_prev: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const result = await gatewayFetch("/api/v1/departments", { method: "POST", body: { name } });
  if (!result.ok) return { error: result.error?.message ?? "Could not create department." };

  revalidatePath("/onboarding");
  return {};
}

export async function addBranchAction(_prev: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const result = await gatewayFetch("/api/v1/branches", { method: "POST", body: { name } });
  if (!result.ok) return { error: result.error?.message ?? "Could not create branch." };

  revalidatePath("/onboarding");
  return {};
}

export async function importCsvAction(_prev: OnboardingActionState, formData: FormData): Promise<OnboardingActionState> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file to import." };

  const csvText = await file.text();
  const result = await importEmployeesCsv(csvText);
  if (!result.ok) {
    const details = result.error?.details as { errors?: { row: number; errors: string[] }[] } | undefined;
    return { error: result.error?.message ?? "Import failed.", rowErrors: details?.errors };
  }

  revalidatePath("/onboarding");
  return { imported: result.data?.imported ?? 0 };
}
