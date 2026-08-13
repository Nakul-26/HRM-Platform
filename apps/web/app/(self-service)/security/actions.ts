"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface EnrollStartState {
  error?: string;
  secret?: string;
  otpauthUri?: string;
  backupCodes?: string[];
}

export async function startEnrollAction(_prev: EnrollStartState, _formData: FormData): Promise<EnrollStartState> {
  const result = await gatewayFetch<{ secret: string; otpauthUri: string; backupCodes: string[] }>("/api/v1/auth/mfa/enroll/start", {
    method: "POST",
    body: {},
  });
  if (!result.ok || !result.data) return { error: result.error?.message ?? "Could not start MFA enrollment." };
  return { secret: result.data.secret, otpauthUri: result.data.otpauthUri, backupCodes: result.data.backupCodes };
}

export interface ConfirmState {
  error?: string;
  confirmed?: boolean;
}

export async function confirmEnrollAction(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the 6-digit code from your authenticator app." };

  const result = await gatewayFetch("/api/v1/auth/mfa/enroll/confirm", { method: "POST", body: { code } });
  if (!result.ok) return { error: result.error?.message ?? "Incorrect code. Try again." };

  revalidatePath("/security");
  return { confirmed: true };
}

export interface DisableState {
  error?: string;
  disabled?: boolean;
}

export async function disableMfaAction(_prev: DisableState, formData: FormData): Promise<DisableState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter a current code (or a backup code) to confirm." };

  const result = await gatewayFetch("/api/v1/auth/mfa/disable", { method: "POST", body: { code } });
  if (!result.ok) return { error: result.error?.message ?? "Incorrect code." };

  revalidatePath("/security");
  return { disabled: true };
}
