import { headers } from "next/headers";
import { ROOT_DOMAIN } from "./env";

/** Pure host -> slug parsing, mirrored from apps/gateway/src/middleware/tenant.ts. */
export function resolveTenantSlugFromHost(host: string): string | null {
  const hostWithoutPort = host.split(":")[0] ?? "";
  if (!hostWithoutPort.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const slug = hostWithoutPort.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!slug || slug.includes(".")) return null;
  return slug;
}

/** Reads the slug middleware.ts already resolved for this request. */
export async function getTenantSlug(): Promise<string | null> {
  const h = await headers();
  return h.get("x-tenant-slug");
}

/** Absolute URL on another tenant's subdomain, same port/protocol as the current request. */
export async function buildTenantUrl(slug: string, path: string): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? ROOT_DOMAIN;
  const port = host.split(":")[1];
  const protocol = process.env.NODE_ENV === "production" ? "https" : "http";
  return `${protocol}://${slug}.${ROOT_DOMAIN}${port ? `:${port}` : ""}${path}`;
}
