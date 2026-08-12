"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface ReviewCycleActionState {
  error?: string;
}

export async function createReviewCycleAction(_prev: ReviewCycleActionState, formData: FormData): Promise<ReviewCycleActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  if (!name || !startDate || !endDate) return { error: "Name, start date, and end date are all required." };

  const result = await gatewayFetch("/api/v1/performance/review-cycles", { method: "POST", body: { name, startDate, endDate } });
  if (!result.ok) return { error: result.error?.message ?? "Could not create review cycle." };

  revalidatePath("/performance/review-cycles");
  return {};
}

export async function closeReviewCycleAction(id: string) {
  const result = await gatewayFetch(`/api/v1/performance/review-cycles/${id}/close`, { method: "PATCH" });
  if (result.ok) revalidatePath("/performance/review-cycles");
  return { ok: result.ok, error: result.error?.message };
}
