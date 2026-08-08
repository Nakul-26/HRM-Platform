"use server";

import { redirect } from "next/navigation";
import { login as gatewayLogin } from "@/lib/gateway";
import { setToken } from "@/lib/session";
import { getTenantSlug } from "@/lib/tenant";

export interface LoginState {
  error?: string;
}

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const slug = await getTenantSlug();
  if (!slug) return { error: "Could not determine your organization from this URL." };

  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const result = await gatewayLogin(slug, { email, password });
  if (!result.ok || !result.data) {
    return { error: result.error?.message ?? "Incorrect email or password." };
  }

  await setToken(result.data.token, result.data.expiresIn);
  redirect("/profile");
}
