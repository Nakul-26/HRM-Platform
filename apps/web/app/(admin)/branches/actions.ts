"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface BranchActionState {
  error?: string;
}

export async function createBranchAction(_prev: BranchActionState, formData: FormData): Promise<BranchActionState> {
  const name = String(formData.get("name") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const result = await gatewayFetch("/api/v1/branches", {
    method: "POST",
    body: timezone ? { name, timezone } : { name },
  });
  if (!result.ok) return { error: result.error?.message ?? "Could not create branch." };

  revalidatePath("/branches");
  return {};
}

export async function deleteBranchAction(id: string) {
  await gatewayFetch(`/api/v1/branches/${id}`, { method: "DELETE" });
  revalidatePath("/branches");
}
