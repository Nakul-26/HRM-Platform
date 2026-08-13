"use server";

import { redirect } from "next/navigation";
import { login as gatewayLogin, mfaEnrollConfirm, mfaEnrollStart, mfaVerify } from "@/lib/gateway";
import { setToken } from "@/lib/session";
import { getTenantSlug } from "@/lib/tenant";

export interface LoginState {
  error?: string;
  mfaRequired?: boolean;
  mfaSetupRequired?: boolean;
  mfaToken?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const slug = await getTenantSlug();
  if (!slug) return { error: "Could not determine your organization from this URL." };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const result = await gatewayLogin(slug, { email, password });
  if (!result.ok || !result.data) return { error: result.error?.message ?? "Incorrect email or password." };

  if ("mfaRequired" in result.data && "mfaToken" in result.data) return { mfaRequired: true, mfaToken: result.data.mfaToken };
  if ("mfaSetupRequired" in result.data && "mfaToken" in result.data) {
    return { mfaSetupRequired: true, mfaToken: result.data.mfaToken };
  }

  await setToken(result.data.token, result.data.expiresIn);
  redirect("/profile");
}

export interface MfaVerifyState {
  error?: string;
}

export async function mfaVerifyAction(_prev: MfaVerifyState, formData: FormData): Promise<MfaVerifyState> {
  const slug = await getTenantSlug();
  if (!slug) return { error: "Could not determine your organization from this URL." };

  const mfaToken = String(formData.get("mfaToken") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter your authentication code." };

  const result = await mfaVerify(slug, mfaToken, code);
  if (!result.ok || !result.data) return { error: result.error?.message ?? "Incorrect code." };

  await setToken(result.data.token, result.data.expiresIn);
  redirect("/profile");
}

export interface MfaSetupStartState {
  error?: string;
  secret?: string;
  otpauthUri?: string;
  backupCodes?: string[];
}

export async function mfaSetupStartAction(_prev: MfaSetupStartState, formData: FormData): Promise<MfaSetupStartState> {
  const slug = await getTenantSlug();
  if (!slug) return { error: "Could not determine your organization from this URL." };

  const mfaToken = String(formData.get("mfaToken") ?? "");
  const result = await mfaEnrollStart(slug, mfaToken);
  if (!result.ok || !result.data) return { error: result.error?.message ?? "Could not start MFA setup." };
  return result.data;
}

export interface MfaSetupConfirmState {
  error?: string;
}

export async function mfaSetupConfirmAction(_prev: MfaSetupConfirmState, formData: FormData): Promise<MfaSetupConfirmState> {
  const slug = await getTenantSlug();
  if (!slug) return { error: "Could not determine your organization from this URL." };

  const mfaToken = String(formData.get("mfaToken") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Enter the 6-digit code to confirm." };

  const result = await mfaEnrollConfirm(slug, mfaToken, code);
  if (!result.ok || !result.data) return { error: result.error?.message ?? "Incorrect code." };

  await setToken(result.data.token, result.data.expiresIn);
  redirect("/profile");
}
