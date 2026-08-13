import { ROOT_DOMAIN, GATEWAY_PORT } from "./env";
import { getToken } from "./session";
import { getTenantSlug } from "./tenant";

export interface GatewayResult<T> {
  status: number;
  ok: boolean;
  data?: T | undefined;
  error?: { code: string; message: string; details?: unknown } | undefined;
  pagination?: { page: number; pageSize: number; totalItems: number; totalPages: number } | undefined;
}

export function gatewayOrigin(slug: string | null): string {
  const host = slug ? `${slug}.${ROOT_DOMAIN}` : ROOT_DOMAIN;
  return `http://${host}:${GATEWAY_PORT}`;
}

async function request<T>(
  path: string,
  init: { method?: string; body?: unknown; slug?: string | null; token?: string | null } = {},
): Promise<GatewayResult<T>> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["content-type"] = "application/json";
  if (init.token) headers.authorization = `Bearer ${init.token}`;

  const fetchInit: RequestInit = { method: init.method ?? "GET", headers, cache: "no-store" };
  if (init.body !== undefined) fetchInit.body = JSON.stringify(init.body);

  const res = await fetch(`${gatewayOrigin(init.slug ?? null)}${path}`, fetchInit);

  const json = (await res.json().catch(() => null)) as
    | { data?: T; error?: GatewayResult<T>["error"]; meta?: { pagination?: GatewayResult<T>["pagination"] } }
    | null;

  return {
    status: res.status,
    ok: res.ok,
    data: json?.data,
    error: json?.error,
    pagination: json?.meta?.pagination,
  };
}

/** Org signup — no tenant resolved yet, so this hits the root domain directly. */
export function signup(body: unknown) {
  return request<{ tenant: { id: string; slug: string; name: string }; token: string; expiresIn: number }>(
    "/api/v1/auth/signup",
    { method: "POST", body },
  );
}

export type LoginResult =
  | { token: string; expiresIn: number; mfaRequired?: undefined; mfaSetupRequired?: undefined }
  | { mfaRequired: true; mfaToken: string }
  | { mfaSetupRequired: true; mfaToken: string };

/**
 * Login — the tenant is known (the subdomain being visited) but there's no
 * token yet. Password verification alone isn't always the end of the story:
 * if the account has MFA enabled, or the tenant's policy requires it for
 * this role, the response carries a narrowly-scoped `mfaToken` for the next
 * step instead of a real access token (apps/gateway/src/routes/auth.ts).
 */
export function login(slug: string, body: unknown) {
  return request<LoginResult>("/api/v1/auth/login", { method: "POST", body, slug });
}

export function mfaVerify(slug: string, mfaToken: string, code: string) {
  return request<{ token: string; expiresIn: number }>("/api/v1/auth/mfa/verify", { method: "POST", body: { mfaToken, code }, slug });
}

export function mfaEnrollStart(slug: string, mfaToken: string) {
  return request<{ secret: string; otpauthUri: string; backupCodes: string[] }>("/api/v1/auth/mfa/enroll/start", {
    method: "POST",
    body: { mfaToken },
    slug,
  });
}

/** When enrollment was forced at login (mfaSetupRequired), confirming also completes login and returns a real token. */
export function mfaEnrollConfirm(slug: string, mfaToken: string, code: string) {
  return request<{ token: string; expiresIn: number }>("/api/v1/auth/mfa/enroll/confirm", {
    method: "POST",
    body: { mfaToken, code },
    slug,
  });
}

/** Public, unauthenticated — used only to decide whether the login page shows an "SSO" link. */
export function ssoStatus(slug: string) {
  return request<{ enabled: boolean }>("/api/v1/auth/sso/status", { slug });
}

/** Every authenticated call — resolves the current tenant + token from the request context. */
export async function gatewayFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<GatewayResult<T>> {
  const [slug, token] = await Promise.all([getTenantSlug(), getToken()]);
  return request<T>(path, { ...init, slug, token });
}

/** Fetches a CSV export endpoint (raw text/csv response, not the JSON envelope) — same auth/tenant resolution as gatewayFetch. */
export async function gatewayFetchCsv(path: string): Promise<{ ok: boolean; text?: string; error?: string }> {
  const [slug, token] = await Promise.all([getTenantSlug(), getToken()]);
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${gatewayOrigin(slug)}${path}`, { headers, cache: "no-store" });
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    return { ok: false, error: json?.error?.message ?? "Export failed." };
  }
  return { ok: true, text: await res.text() };
}

/** CSV bulk import takes a raw text/csv body, not JSON — everything else about auth/tenant resolution is identical. */
export async function importEmployeesCsv(csvText: string): Promise<GatewayResult<{ imported: number }>> {
  const [slug, token] = await Promise.all([getTenantSlug(), getToken()]);
  const headers: Record<string, string> = { "content-type": "text/csv" };
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(`${gatewayOrigin(slug)}/api/v1/employees/import`, {
    method: "POST",
    headers,
    body: csvText,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as { data?: { imported: number }; error?: GatewayResult<unknown>["error"] } | null;
  return { status: res.status, ok: res.ok, data: json?.data, error: json?.error };
}
