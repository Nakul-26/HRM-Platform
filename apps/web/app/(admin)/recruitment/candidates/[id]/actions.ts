"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface CandidateDetailActionState {
  error?: string;
  employeeId?: string;
}

function revalidate(id: string) {
  revalidatePath(`/recruitment/candidates/${id}`);
}

export async function updateStageAction(id: string, _prev: CandidateDetailActionState, formData: FormData): Promise<CandidateDetailActionState> {
  const pipelineStage = String(formData.get("pipelineStage") ?? "");
  if (!pipelineStage) return { error: "A stage is required." };

  const result = await gatewayFetch(`/api/v1/recruitment/candidates/${id}`, { method: "PATCH", body: { pipelineStage } });
  if (!result.ok) return { error: result.error?.message ?? "Could not update the candidate's stage." };

  revalidate(id);
  return {};
}

export async function presignResumeUploadAction(candidateId: string, fileName: string, contentType: string) {
  const result = await gatewayFetch<{ objectKey: string; uploadUrl: string }>(
    `/api/v1/recruitment/candidates/${candidateId}/resume/presign-upload`,
    { method: "POST", body: { fileName, contentType } },
  );
  return { ok: result.ok, data: result.data, error: result.error?.message };
}

export async function recordResumeAction(candidateId: string, objectKey: string) {
  const result = await gatewayFetch(`/api/v1/recruitment/candidates/${candidateId}/resume`, { method: "PATCH", body: { objectKey } });
  if (result.ok) revalidate(candidateId);
  return { ok: result.ok, error: result.error?.message };
}

export async function getResumeDownloadUrlAction(candidateId: string) {
  const result = await gatewayFetch<{ downloadUrl: string }>(`/api/v1/recruitment/candidates/${candidateId}/resume/download-url`);
  return { ok: result.ok, url: result.data?.downloadUrl, error: result.error?.message };
}

export async function scheduleInterviewAction(
  candidateId: string,
  _prev: CandidateDetailActionState,
  formData: FormData,
): Promise<CandidateDetailActionState> {
  const interviewerId = String(formData.get("interviewerId") ?? "");
  const scheduledAt = String(formData.get("scheduledAt") ?? "");
  if (!interviewerId || !scheduledAt) return { error: "Interviewer and time are both required." };

  const result = await gatewayFetch("/api/v1/recruitment/interviews", {
    method: "POST",
    body: { candidateId, interviewerId, scheduledAt: new Date(scheduledAt).toISOString() },
  });
  if (!result.ok) return { error: result.error?.message ?? "Could not schedule the interview." };

  revalidate(candidateId);
  return {};
}

export async function createOfferAction(
  candidateId: string,
  _prev: CandidateDetailActionState,
  formData: FormData,
): Promise<CandidateDetailActionState> {
  const designationId = String(formData.get("designationId") ?? "");
  const offeredCtc = Number.parseFloat(String(formData.get("offeredCtc") ?? ""));
  const joiningDate = String(formData.get("joiningDate") ?? "");
  if (!Number.isFinite(offeredCtc) || !joiningDate) return { error: "Offered CTC and joining date are required." };

  const body: Record<string, unknown> = { candidateId, offeredCtc, joiningDate };
  if (designationId) body.designationId = designationId;

  const result = await gatewayFetch("/api/v1/recruitment/offers", { method: "POST", body });
  if (!result.ok) return { error: result.error?.message ?? "Could not create the offer." };

  revalidate(candidateId);
  return {};
}

export async function updateOfferStatusAction(candidateId: string, offerId: string, status: string) {
  const result = await gatewayFetch(`/api/v1/recruitment/offers/${offerId}`, { method: "PATCH", body: { status } });
  if (result.ok) revalidate(candidateId);
  return { ok: result.ok, error: result.error?.message };
}

export async function hireAction(
  candidateId: string,
  _prev: CandidateDetailActionState,
  formData: FormData,
): Promise<CandidateDetailActionState> {
  const employeeCode = String(formData.get("employeeCode") ?? "").trim();
  if (!employeeCode) return { error: "An employee code is required." };

  const dateOfJoining = String(formData.get("dateOfJoining") ?? "");
  const departmentId = String(formData.get("departmentId") ?? "");
  const designationId = String(formData.get("designationId") ?? "");
  const branchId = String(formData.get("branchId") ?? "");
  const managerId = String(formData.get("managerId") ?? "");

  const body: Record<string, unknown> = { employeeCode };
  if (dateOfJoining) body.dateOfJoining = dateOfJoining;
  if (departmentId) body.departmentId = departmentId;
  if (designationId) body.designationId = designationId;
  if (branchId) body.branchId = branchId;
  if (managerId) body.managerId = managerId;

  const result = await gatewayFetch<{ employeeId: string }>(`/api/v1/recruitment/candidates/${candidateId}/hire`, { method: "POST", body });
  if (!result.ok || !result.data) return { error: result.error?.message ?? "Could not hire this candidate." };

  revalidate(candidateId);
  return { employeeId: result.data.employeeId };
}
