"use server";

import { revalidatePath } from "next/cache";
import type { AuthContext } from "@hrm/types";
import { gatewayFetch } from "@/lib/gateway";

export interface GoalActionState {
  error?: string;
}

export async function createGoalAction(_prev: GoalActionState, formData: FormData): Promise<GoalActionState> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { error: "A title is required." };

  const auth = await gatewayFetch<AuthContext>("/api/v1/whoami");
  if (!auth.ok || !auth.data?.employeeId) return { error: "Could not resolve your employee record." };

  const weightRaw = String(formData.get("weight") ?? "");
  const reviewCycleId = String(formData.get("reviewCycleId") ?? "");

  const body: Record<string, unknown> = { employeeId: auth.data.employeeId, title };
  const weight = Number.parseInt(weightRaw, 10);
  if (Number.isFinite(weight)) body.weight = weight;
  if (reviewCycleId) body.reviewCycleId = reviewCycleId;

  const result = await gatewayFetch("/api/v1/performance/goals", { method: "POST", body });
  if (!result.ok) return { error: result.error?.message ?? "Could not create goal." };

  revalidatePath("/performance");
  return {};
}

export async function updateGoalProgressAction(id: string, progress: number) {
  const result = await gatewayFetch(`/api/v1/performance/goals/${id}`, { method: "PATCH", body: { progress } });
  if (result.ok) revalidatePath("/performance");
  return { ok: result.ok, error: result.error?.message };
}
