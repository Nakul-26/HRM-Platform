"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface FeedbackActionState {
  error?: string;
}

export async function submitFeedbackAction(id: string, _prev: FeedbackActionState, formData: FormData): Promise<FeedbackActionState> {
  const rating = Number.parseInt(String(formData.get("rating") ?? ""), 10);
  const feedback = String(formData.get("feedback") ?? "").trim();
  if (!Number.isFinite(rating) || !feedback) return { error: "A rating and written feedback are both required." };

  const result = await gatewayFetch(`/api/v1/recruitment/interviews/${id}/feedback`, { method: "PATCH", body: { rating, feedback } });
  if (!result.ok) return { error: result.error?.message ?? "Could not submit feedback." };

  revalidatePath(`/interviews/${id}`);
  revalidatePath("/interviews");
  return {};
}
