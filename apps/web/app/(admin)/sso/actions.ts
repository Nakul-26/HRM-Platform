"use server";

import { revalidatePath } from "next/cache";
import { gatewayFetch } from "@/lib/gateway";

export interface SsoConnectionActionState {
  error?: string;
}

export async function saveSsoConnectionAction(
  _prev: SsoConnectionActionState,
  formData: FormData,
): Promise<SsoConnectionActionState> {
  const issuer = String(formData.get("issuer") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const clientSecret = String(formData.get("clientSecret") ?? "").trim();
  const enabled = formData.get("enabled") === "on";
  if (!issuer || !clientId || !clientSecret) return { error: "Issuer, client ID, and client secret are all required." };

  const result = await gatewayFetch("/api/v1/settings/sso", { method: "PUT", body: { issuer, clientId, clientSecret, enabled } });
  if (!result.ok) return { error: result.error?.message ?? "Could not save the SSO connection." };

  revalidatePath("/sso");
  return {};
}

export async function deleteSsoConnectionAction() {
  await gatewayFetch("/api/v1/settings/sso", { method: "DELETE" });
  revalidatePath("/sso");
}

export interface MfaPolicyActionState {
  error?: string;
}

export async function saveMfaPolicyAction(_prev: MfaPolicyActionState, formData: FormData): Promise<MfaPolicyActionState> {
  const requiredRoles = formData.getAll("requiredRoles").map(String);

  const result = await gatewayFetch("/api/v1/settings/mfa-policy", { method: "PUT", body: { requiredRoles } });
  if (!result.ok) return { error: result.error?.message ?? "Could not save the MFA policy." };

  revalidatePath("/sso");
  return {};
}
