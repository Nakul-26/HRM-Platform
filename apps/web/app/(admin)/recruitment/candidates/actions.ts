"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface CandidateActionState {
  error?: string;
}

export async function createCandidateAction(_prev: CandidateActionState, formData: FormData): Promise<CandidateActionState> {
  const jobOpeningId = String(formData.get("jobOpeningId") ?? "");
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  if (!jobOpeningId || !fullName || !email) return { error: "Job opening, name, and email are all required." };

  const result = await gatewayFetch("/api/v1/recruitment/candidates", { method: "POST", body: { jobOpeningId, fullName, email } });
  if (!result.ok) return { error: result.error?.message ?? "Could not create candidate." };

  revalidatePath("/recruitment/candidates");
  return {};
}
