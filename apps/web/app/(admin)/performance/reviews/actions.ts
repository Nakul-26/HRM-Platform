"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface ReviewActionState {
  error?: string;
}

export async function createReviewAction(_prev: ReviewActionState, formData: FormData): Promise<ReviewActionState> {
  const employeeId = String(formData.get("employeeId") ?? "");
  const reviewCycleId = String(formData.get("reviewCycleId") ?? "");
  if (!employeeId || !reviewCycleId) return { error: "Employee and review cycle are both required." };

  const ratingRaw = String(formData.get("rating") ?? "");
  const comments = String(formData.get("comments") ?? "").trim();

  const body: Record<string, unknown> = { employeeId, reviewCycleId };
  const rating = Number.parseFloat(ratingRaw);
  if (Number.isFinite(rating)) body.rating = rating;
  if (comments) body.comments = comments;

  const result = await gatewayFetch("/api/v1/performance/reviews", { method: "POST", body });
  if (!result.ok) return { error: result.error?.message ?? "Could not create review." };

  revalidatePath("/performance/reviews");
  return {};
}

export async function submitReviewAction(id: string) {
  const result = await gatewayFetch(`/api/v1/performance/reviews/${id}/submit`, { method: "PATCH" });
  if (result.ok) revalidatePath("/performance/reviews");
  return { ok: result.ok, error: result.error?.message };
}
