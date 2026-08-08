"use server";

import { redirect } from "next/navigation";
import { signup as gatewaySignup } from "@/lib/gateway";
import { setToken } from "@/lib/session";
import { buildTenantUrl } from "@/lib/tenant";

export interface SignupState {
  error?: string;
}

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const slug = String(formData.get("slug") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const adminName = String(formData.get("adminName") ?? "").trim();
  const adminEmail = String(formData.get("adminEmail") ?? "").trim();
  const adminPassword = String(formData.get("adminPassword") ?? "");

  const result = await gatewaySignup({ slug, name, adminEmail, adminName, adminPassword });
  if (!result.ok || !result.data) {
    return { error: result.error?.message ?? "Could not create your organization." };
  }

  await setToken(result.data.token, result.data.expiresIn);
  redirect(await buildTenantUrl(result.data.tenant.slug, "/onboarding"));
}
