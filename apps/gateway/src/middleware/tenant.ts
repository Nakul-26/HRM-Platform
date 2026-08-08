import type { MiddlewareHandler } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    tenantSlug: string;
  }
}

/**
 * Pure host -> tenant-slug parsing, shared by the `tenantResolution`
 * middleware (used by every proxied route) and the login route (which needs
 * the slug immediately, before jwtAuth or any general middleware chain
 * ordering, since there is no token yet to hang a `next()` chain off of).
 */
export function resolveTenantSlugFromHost(host: string, rootDomain: string): string | null {
  const hostWithoutPort = host.split(":")[0] ?? "";
  if (!hostWithoutPort.endsWith(`.${rootDomain}`)) return null;

  const slug = hostWithoutPort.slice(0, -(rootDomain.length + 1));
  if (!slug || slug.includes(".")) return null;
  return slug;
}

/**
 * Resolves the tenant from the request's subdomain (docs/architecture/03-multi-tenancy.md).
 * Runs before auth verification — everything downstream (rate limiting keys,
 * auth context validation) needs to know which tenant it's operating in.
 *
 * TODO(Phase 1): also check a custom-domain mapping (KV, edge-cached) for
 * tenants on white-labeled domains, falling back to subdomain parsing.
 */
export function tenantResolution(rootDomain: string): MiddlewareHandler {
  return async (c, next) => {
    const slug = resolveTenantSlugFromHost(c.req.header("host") ?? "", rootDomain);
    if (!slug) {
      return c.json(
        { error: { code: "TENANT_NOT_RESOLVED", message: "Request host is not a recognized tenant domain" }, requestId: c.get("requestId") },
        400,
      );
    }

    c.set("tenantSlug", slug);
    await next();
  };
}
