/**
 * ROOT_DOMAIN must match the Gateway's own ROOT_DOMAIN (apps/gateway/wrangler.jsonc)
 * — this app resolves tenants from its own subdomain the same way the
 * Gateway does (docs/architecture/03-multi-tenancy.md), then talks to the
 * Gateway on the same subdomain so its tenantResolution middleware agrees.
 */
export const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? "lvh.me";
export const GATEWAY_PORT = process.env.GATEWAY_PORT ?? "8787";
