"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface PromotionActionState {
  error?: string;
}

export async function createPromotionAction(_prev: PromotionActionState, formData: FormData): Promise<PromotionActionState> {
  const employeeId = String(formData.get("employeeId") ?? "");
  const reviewId = String(formData.get("reviewId") ?? "");
  const newDesignationId = String(formData.get("newDesignationId") ?? "");
  const effectiveDate = String(formData.get("effectiveDate") ?? "");
  if (!employeeId || !reviewId || !newDesignationId || !effectiveDate) {
    return { error: "Employee, review, new designation, and effective date are all required." };
  }

  const notes = String(formData.get("notes") ?? "").trim();
  const body: Record<string, unknown> = { employeeId, reviewId, newDesignationId, effectiveDate };
  if (notes) body.notes = notes;

  const result = await gatewayFetch("/api/v1/performance/promotions", { method: "POST", body });
  if (!result.ok) return { error: result.error?.message ?? "Could not record promotion." };

  revalidatePath("/performance/promotions");
  return {};
}
