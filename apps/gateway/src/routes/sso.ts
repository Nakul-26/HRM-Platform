import { Hono } from "hono";
import { setCookie } from "hono/cookie";
import { and, eq } from "drizzle-orm";
import {
  buildAuthorizationUrl,
  decryptSecret,
  exchangeCodeForIdToken,
  generateNonce,
  generatePkce,
  signAccessToken,
  signEphemeralToken,
  verifyEphemeralToken,
  verifyIdToken,
} from "@hrm/auth";
import { schema, withTenant } from "@hrm/db";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail } from "../lib/response";
import { resolveTenantSlugFromHost } from "../middleware/tenant";
import { buildAuthContext } from "./auth";

const { ssoConnections, tenants, users } = schema;

const SSO_STATE_TTL_SECONDS = 10 * 60;
const SESSION_COOKIE_NAME = "hrm_token";
const SESSION_TTL_SECONDS = 15 * 60;

interface SsoStatePayload {
  [key: string]: unknown;
  purpose: "sso_state";
  tenantId: string;
  codeVerifier: string;
  nonce: string;
}

/**
 * `/api/v1/auth/sso/*` — mounted alongside `/api/v1/auth/*` in src/index.ts,
 * before `tenantResolution`/`jwtAuth`, for the same reason login/signup are:
 * these requests (including the external IdP's browser redirect back to
 * /callback) arrive with no bearer token and, for /login and /callback,
 * resolve their own tenant from the Host header instead.
 */
export function ssoRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/status", async (c) => {
    const slug = resolveTenantSlugFromHost(c.req.header("host") ?? "", c.env.ROOT_DOMAIN);
    if (!slug) return c.json({ data: { enabled: false } });

    const db = getDb(c.env.APP_DATABASE_URL);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.subdomain, slug));
    if (!tenant) return c.json({ data: { enabled: false } });

    const connection = await withTenant(db, tenant.id, async (tx) => {
      const [row] = await tx.select().from(ssoConnections).where(eq(ssoConnections.tenantId, tenant.id));
      return row;
    });
    return c.json({ data: { enabled: connection?.enabled ?? false } });
  });

  app.get("/login", async (c) => {
    const slug = resolveTenantSlugFromHost(c.req.header("host") ?? "", c.env.ROOT_DOMAIN);
    if (!slug) return fail(c, 400, "TENANT_NOT_RESOLVED", "Request host is not a recognized tenant domain.");

    const db = getDb(c.env.APP_DATABASE_URL);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.subdomain, slug));
    if (!tenant) return fail(c, 404, "TENANT_NOT_FOUND", "No organization found for this domain.");

    const connection = await withTenant(db, tenant.id, async (tx) => {
      const [row] = await tx.select().from(ssoConnections).where(eq(ssoConnections.tenantId, tenant.id));
      return row;
    });
    if (!connection?.enabled) return fail(c, 404, "SSO_NOT_CONFIGURED", "SSO is not configured for this organization.");

    const { codeVerifier, codeChallenge } = await generatePkce();
    const nonce = generateNonce();
    const state = await signEphemeralToken(
      { purpose: "sso_state", tenantId: tenant.id, codeVerifier, nonce } satisfies SsoStatePayload,
      { signingKey: c.env.JWT_SIGNING_KEY, kid: c.env.JWT_KID },
      SSO_STATE_TTL_SECONDS,
    );

    const redirectUri = callbackUrl(c);
    const authorizationUrl = buildAuthorizationUrl(
      { authorizationEndpoint: connection.authorizationEndpoint, clientId: connection.clientId },
      { redirectUri, state, nonce, codeChallenge },
    );
    return c.redirect(authorizationUrl, 302);
  });

  app.get("/callback", async (c) => {
    const slug = resolveTenantSlugFromHost(c.req.header("host") ?? "", c.env.ROOT_DOMAIN);
    if (!slug) return fail(c, 400, "TENANT_NOT_RESOLVED", "Request host is not a recognized tenant domain.");

    const db = getDb(c.env.APP_DATABASE_URL);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.subdomain, slug));
    if (!tenant) return fail(c, 404, "TENANT_NOT_FOUND", "No organization found for this domain.");

    const idpError = c.req.query("error");
    if (idpError) return c.redirect(webAppUrl(c, slug, `/login?error=sso_${idpError}`), 302);

    const code = c.req.query("code");
    const state = c.req.query("state");
    if (!code || !state) return fail(c, 400, "VALIDATION_ERROR", "Missing code or state.");

    let statePayload: SsoStatePayload;
    try {
      statePayload = await verifyEphemeralToken<SsoStatePayload>(state, {
        signingKey: c.env.JWT_SIGNING_KEY,
        kid: c.env.JWT_KID,
      });
    } catch {
      return fail(c, 400, "INVALID_STATE", "SSO state is invalid or expired.");
    }
    if (statePayload.purpose !== "sso_state" || statePayload.tenantId !== tenant.id) {
      return fail(c, 400, "INVALID_STATE", "SSO state does not match this organization.");
    }

    const connection = await withTenant(db, tenant.id, async (tx) => {
      const [row] = await tx.select().from(ssoConnections).where(eq(ssoConnections.tenantId, tenant.id));
      return row;
    });
    if (!connection?.enabled) return fail(c, 404, "SSO_NOT_CONFIGURED", "SSO is not configured for this organization.");

    const clientSecret = await decryptSecret(connection.clientSecretCiphertext, c.env.APP_ENCRYPTION_KEY);
    const idToken = await exchangeCodeForIdToken(
      { tokenEndpoint: connection.tokenEndpoint, clientId: connection.clientId, clientSecret },
      { code, codeVerifier: statePayload.codeVerifier, redirectUri: callbackUrl(c) },
    );
    const claims = await verifyIdToken(
      { issuer: connection.issuer, clientId: connection.clientId, jwksUri: connection.jwksUri },
      idToken,
      { nonce: statePayload.nonce },
    );

    const auth = await withTenant(db, tenant.id, async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(and(eq(users.tenantId, tenant.id), eq(users.email, claims.email)));
      if (!user) return null;
      return buildAuthContext(tx, tenant.id, user);
    });

    if (!auth) return c.redirect(webAppUrl(c, slug, "/login?error=sso_no_account"), 302);

    const token = await signAccessToken(auth, { signingKey: c.env.JWT_SIGNING_KEY, kid: c.env.JWT_KID });
    setCookie(c, SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Lax",
      path: "/",
      domain: `.${c.env.ROOT_DOMAIN}`,
      maxAge: SESSION_TTL_SECONDS,
    });
    return c.redirect(webAppUrl(c, slug, "/"), 302);
  });

  return app;
}

/** Must be byte-identical between /login and /callback — both derive it the same way, from the current request's own origin. */
function callbackUrl(c: { req: { url: string } }): string {
  return `${new URL(c.req.url).origin}/api/v1/auth/sso/callback`;
}

/** apps/web runs on a different port than the Gateway in local dev (WEB_APP_PORT); same origin in production. */
function webAppUrl(
  c: { req: { url: string }; env: { ROOT_DOMAIN: string; WEB_APP_PORT: string } },
  slug: string,
  path: string,
): string {
  const protocol = new URL(c.req.url).protocol;
  const portSuffix = c.env.WEB_APP_PORT ? `:${c.env.WEB_APP_PORT}` : "";
  return `${protocol}//${slug}.${c.env.ROOT_DOMAIN}${portSuffix}${path}`;
}
