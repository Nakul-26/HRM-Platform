import { NextRequest, NextResponse } from "next/server";

const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? "lvh.me";
const COOKIE_NAME = "hrm_token";
const PUBLIC_PATHS = ["/signup"];

function resolveTenantSlugFromHost(host: string): string | null {
  const hostWithoutPort = host.split(":")[0] ?? "";
  if (!hostWithoutPort.endsWith(`.${ROOT_DOMAIN}`)) return null;
  const slug = hostWithoutPort.slice(0, -(ROOT_DOMAIN.length + 1));
  if (!slug || slug.includes(".")) return null;
  return slug;
}

/**
 * This app is itself subdomain-routed per tenant, same as the Gateway
 * (docs/architecture/03-multi-tenancy.md) — resolves the tenant from the
 * request's own host and stamps it into a header every Server
 * Component/Action can read (see lib/tenant.ts), and guards every
 * non-public route behind a session cookie.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const slug = resolveTenantSlugFromHost(host);
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (!slug && !isPublic) {
    return NextResponse.redirect(new URL("/signup", request.url));
  }

  const hasToken = request.cookies.has(COOKIE_NAME);
  if (slug && !hasToken && pathname !== "/login" && !isPublic) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const requestHeaders = new Headers(request.headers);
  if (slug) requestHeaders.set("x-tenant-slug", slug);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
