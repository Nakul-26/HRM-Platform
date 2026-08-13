import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { discoverOidcEndpoints, encryptSecret } from "@hrm/auth";
import { schema, withTenant } from "@hrm/db";
import { hasPermission } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, ok } from "../lib/response";

const { ssoConnections, tenantSettings } = schema;

const upsertSsoSchema = z.object({
  issuer: z.string().url(),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  enabled: z.boolean().optional(),
});

const mfaPolicySchema = z.object({
  requiredRoles: z.array(z.string()),
});

/**
 * Tenant-admin configuration for SSO/MFA — a normal authenticated route
 * (unlike routes/sso.ts and routes/mfa.ts, which run before jwtAuth because
 * they're mid-login). Mounted under /api/v1/settings, after the Gateway's
 * usual tenantResolution + jwtAuth middleware, gated on `tenant.settings.manage`.
 */
export function settingsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/sso", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "tenant.settings.manage")) return fail(c, 403, "FORBIDDEN", "Not permitted.");

    const db = getDb(c.env.APP_DATABASE_URL);
    const connection = await withTenant(db, auth.tenantId, async (tx) => {
      const [row] = await tx.select().from(ssoConnections).where(eq(ssoConnections.tenantId, auth.tenantId));
      return row;
    });

    if (!connection) return ok(c, { configured: false });
    const { clientSecretCiphertext, ...safeFields } = connection;
    void clientSecretCiphertext;
    return ok(c, { configured: true, ...safeFields });
  });

  app.put("/sso", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "tenant.settings.manage")) return fail(c, 403, "FORBIDDEN", "Not permitted.");

    const parsed = upsertSsoSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid SSO connection payload", parsed.error.flatten());

    let endpoints;
    try {
      endpoints = await discoverOidcEndpoints(parsed.data.issuer);
    } catch {
      return fail(c, 400, "OIDC_DISCOVERY_FAILED", "Could not discover OIDC endpoints for that issuer.");
    }

    const db = getDb(c.env.APP_DATABASE_URL);
    const encryptedClientSecret = await encryptSecret(parsed.data.clientSecret, c.env.APP_ENCRYPTION_KEY);

    const saved = await withTenant(db, auth.tenantId, async (tx) => {
      const [existing] = await tx.select().from(ssoConnections).where(eq(ssoConnections.tenantId, auth.tenantId));
      const values = {
        issuer: parsed.data.issuer,
        clientId: parsed.data.clientId,
        clientSecretCiphertext: encryptedClientSecret,
        authorizationEndpoint: endpoints.authorizationEndpoint,
        tokenEndpoint: endpoints.tokenEndpoint,
        jwksUri: endpoints.jwksUri,
        enabled: parsed.data.enabled ?? true,
      };

      if (existing) {
        const [updated] = await tx
          .update(ssoConnections)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(ssoConnections.tenantId, auth.tenantId))
          .returning();
        return updated;
      }
      const [inserted] = await tx.insert(ssoConnections).values({ tenantId: auth.tenantId, ...values }).returning();
      return inserted;
    });

    if (!saved) return fail(c, 500, "INTERNAL_ERROR", "Failed to save SSO connection.");
    const { clientSecretCiphertext, ...safeFields } = saved;
    void clientSecretCiphertext;
    return ok(c, { configured: true, ...safeFields });
  });

  app.delete("/sso", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "tenant.settings.manage")) return fail(c, 403, "FORBIDDEN", "Not permitted.");

    const db = getDb(c.env.APP_DATABASE_URL);
    await withTenant(db, auth.tenantId, (tx) => tx.delete(ssoConnections).where(eq(ssoConnections.tenantId, auth.tenantId)));
    return c.body(null, 204);
  });

  app.get("/mfa-policy", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "tenant.settings.manage")) return fail(c, 403, "FORBIDDEN", "Not permitted.");

    const db = getDb(c.env.APP_DATABASE_URL);
    const requiredRoles = await withTenant(db, auth.tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(tenantSettings)
        .where(and(eq(tenantSettings.tenantId, auth.tenantId), eq(tenantSettings.key, "mfa_required_roles")));
      const value = row?.value;
      return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : [];
    });
    return ok(c, { requiredRoles });
  });

  app.put("/mfa-policy", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "tenant.settings.manage")) return fail(c, 403, "FORBIDDEN", "Not permitted.");

    const parsed = mfaPolicySchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid MFA policy payload", parsed.error.flatten());

    const db = getDb(c.env.APP_DATABASE_URL);
    await withTenant(db, auth.tenantId, async (tx) => {
      await tx
        .insert(tenantSettings)
        .values({ tenantId: auth.tenantId, key: "mfa_required_roles", value: parsed.data.requiredRoles })
        .onConflictDoUpdate({
          target: [tenantSettings.tenantId, tenantSettings.key],
          set: { value: parsed.data.requiredRoles },
        });
    });
    return ok(c, { requiredRoles: parsed.data.requiredRoles });
  });

  return app;
}
