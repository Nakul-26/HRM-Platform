"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface JobOpeningActionState {
  error?: string;
}

export async function createJobOpeningAction(_prev: JobOpeningActionState, formData: FormData): Promise<JobOpeningActionState> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "Title is required." };

  const departmentId = String(formData.get("departmentId") ?? "");
  const employmentType = String(formData.get("employmentType") ?? "");

  const body: Record<string, unknown> = { title };
  if (departmentId) body.departmentId = departmentId;
  if (employmentType) body.employmentType = employmentType;

  const result = await gatewayFetch("/api/v1/recruitment/job-openings", { method: "POST", body });
  if (!result.ok) return { error: result.error?.message ?? "Could not create job opening." };

  revalidatePath("/recruitment/job-openings");
  return {};
}
