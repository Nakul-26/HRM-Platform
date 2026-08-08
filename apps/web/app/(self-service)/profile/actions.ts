"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface ProfileFormState {
  error?: string;
  success?: boolean;
}

export async function updateProfileAction(_prev: ProfileFormState, formData: FormData): Promise<ProfileFormState> {
  const personalEmail = String(formData.get("personalEmail") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();

  const body: Record<string, string> = {};
  if (personalEmail) body.personalEmail = personalEmail;
  if (phone) body.phone = phone;
  if (Object.keys(body).length === 0) return { error: "Nothing to update." };

  const result = await gatewayFetch("/api/v1/employees/me", { method: "PATCH", body });
  if (!result.ok) return { error: result.error?.message ?? "Could not update your profile." };

  revalidatePath("/profile");
  return { success: true };
}

export async function presignUploadAction(employeeId: string, fileName: string, contentType: string) {
  const result = await gatewayFetch<{ objectKey: string; uploadUrl: string }>("/api/v1/documents/presign-upload", {
    method: "POST",
    body: { employeeId, fileName, contentType },
  });
  return { ok: result.ok, data: result.data, error: result.error?.message };
}

export async function recordDocumentAction(employeeId: string, documentType: string, objectKey: string) {
  const result = await gatewayFetch(`/api/v1/employees/${employeeId}/documents`, {
    method: "POST",
    body: { documentType, objectKey },
  });
  if (result.ok) revalidatePath("/profile");
  return { ok: result.ok, error: result.error?.message };
}

export async function getDownloadUrlAction(objectKey: string) {
  const result = await gatewayFetch<{ downloadUrl: string }>(
    `/api/v1/documents/download-url?objectKey=${encodeURIComponent(objectKey)}`,
  );
  return { ok: result.ok, url: result.data?.downloadUrl, error: result.error?.message };
}
