"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface DesignationActionState {
  error?: string;
}

export async function createDesignationAction(
  _prev: DesignationActionState,
  formData: FormData,
): Promise<DesignationActionState> {
  const title = String(formData.get("title") ?? "").trim();
  const grade = String(formData.get("grade") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const result = await gatewayFetch("/api/v1/designations", {
    method: "POST",
    body: grade ? { title, grade } : { title },
  });
  if (!result.ok) return { error: result.error?.message ?? "Could not create designation." };

  revalidatePath("/designations");
  return {};
}

export async function deleteDesignationAction(id: string) {
  await gatewayFetch(`/api/v1/designations/${id}`, { method: "DELETE" });
  revalidatePath("/designations");
}
