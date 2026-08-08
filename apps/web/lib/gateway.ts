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

/** Login — the tenant is known (the subdomain being visited) but there's no token yet. */
export function login(slug: string, body: unknown) {
  return request<{ token: string; expiresIn: number }>("/api/v1/auth/login", { method: "POST", body, slug });
}

/** Every authenticated call — resolves the current tenant + token from the request context. */
export async function gatewayFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<GatewayResult<T>> {
  const [slug, token] = await Promise.all([getTenantSlug(), getToken()]);
  return request<T>(path, { ...init, slug, token });
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
