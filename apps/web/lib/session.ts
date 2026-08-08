import { cookies } from "next/headers";
import { ROOT_DOMAIN } from "./env";

const COOKIE_NAME = "hrm_token";

/**
 * Domain is set to the whole root domain (not host-only) so the cookie
 * survives the redirect from the root domain (signup) to the tenant's own
 * subdomain (onboarding/login) — see docs/architecture/03-multi-tenancy.md;
 * this app is itself subdomain-routed per tenant, same as the Gateway.
 */
export async function setToken(token: string, expiresInSeconds: number) {
  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    domain: `.${ROOT_DOMAIN}`,
    maxAge: expiresInSeconds,
  });
}

export async function getToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(COOKIE_NAME)?.value ?? null;
}

export async function clearToken() {
  const store = await cookies();
  store.delete({ name: COOKIE_NAME, path: "/", domain: `.${ROOT_DOMAIN}` });
}
