import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { createTenant, schema, withTenant, type Database } from "@hrm/db";
import { signAccessToken, signEphemeralToken } from "@hrm/auth";
import { createTenantSchema, type AuthContext, type Permission } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, ok } from "../lib/response";
import { resolveTenantSlugFromHost } from "../middleware/tenant";

const { accounts, employees, mfaTotpCredentials, rolePermissions, roles, tenants, tenantSettings, users } = schema;

/**
 * docs/architecture/06-security.md describes MFA enforcement as "on by
 * default for Admin/HR Manager roles once shipped" — but forcing every
 * existing tenant's admin into an MFA-setup detour on their very next login,
 * with no warning and no settings UI they've ever seen yet, is a hostile
 * default, not a safe one. This is the *suggested preset* the admin SSO/MFA
 * settings page pre-selects for a tenant enabling enforcement for the first
 * time — not the wire default. With no `tenantSettings` row yet (the case
 * for every tenant until an admin visits that page), enforcement is off
 * (`parseMfaRequiredRoles` below defaults to `[]`).
 */
export const SUGGESTED_MFA_REQUIRED_ROLES = ["admin", "hr_manager"];
const MFA_CHALLENGE_TTL_SECONDS = 5 * 60;
const MFA_SETUP_TTL_SECONDS = 10 * 60;

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

/**
 * `/api/v1/auth/*` — the only routes reachable without a bearer token,
 * mounted in src/index.ts before both `tenantResolution` and `jwtAuth` run.
 * Signup has no tenant to resolve yet (it creates one); login resolves the
 * tenant slug from the host itself rather than depending on
 * `tenantResolution`'s middleware having already run in this chain.
 */
export function authRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/signup", async (c) => {
    const parsed = createTenantSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid signup payload", parsed.error.flatten());

    const db = getDb(c.env.APP_DATABASE_URL);
    let tenant;
    try {
      tenant = await createTenant(db, parsed.data);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return fail(c, 409, "TENANT_SLUG_TAKEN", "An organization with this URL already exists.");
      }
      throw err;
    }

    const token = await mintTokenForAdmin(db, tenant.id, c.env);
    return ok(c, { tenant: { id: tenant.id, slug: tenant.subdomain, name: tenant.name }, ...token }, 201);
  });

  app.post("/login", async (c) => {
    const slug = resolveTenantSlugFromHost(c.req.header("host") ?? "", c.env.ROOT_DOMAIN);
    if (!slug) return fail(c, 400, "TENANT_NOT_RESOLVED", "Request host is not a recognized tenant domain.");

    const parsed = loginSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid login payload", parsed.error.flatten());

    const db = getDb(c.env.APP_DATABASE_URL);
    const [tenant] = await db.select().from(tenants).where(eq(tenants.subdomain, slug));
    if (!tenant) return fail(c, 404, "TENANT_NOT_FOUND", "No organization found for this domain.");

    const result = await withTenant(db, tenant.id, async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.email, parsed.data.email));
      if (!user) return null;

      const [account] = await tx
        .select()
        .from(accounts)
        .where(eq(accounts.userId, user.id));
      if (!account?.passwordHash) return null;

      const valid = await verifyPassword({ hash: account.passwordHash, password: parsed.data.password });
      if (!valid) return null;

      const auth = await buildAuthContext(tx, tenant.id, user);
      const [mfaCred] = await tx.select().from(mfaTotpCredentials).where(eq(mfaTotpCredentials.userId, user.id));
      const [settingsRow] = await tx
        .select()
        .from(tenantSettings)
        .where(and(eq(tenantSettings.tenantId, tenant.id), eq(tenantSettings.key, "mfa_required_roles")));

      return { auth, mfaEnabled: mfaCred?.enabled ?? false, requiredRoles: parseMfaRequiredRoles(settingsRow?.value) };
    });

    if (!result) return fail(c, 401, "INVALID_CREDENTIALS", "Incorrect email or password.");
    const { auth, mfaEnabled, requiredRoles } = result;
    const jwtConfig = { signingKey: c.env.JWT_SIGNING_KEY, kid: c.env.JWT_KID };

    if (mfaEnabled) {
      const mfaToken = await signEphemeralToken(
        { purpose: "mfa", tenantId: auth.tenantId, userId: auth.userId },
        jwtConfig,
        MFA_CHALLENGE_TTL_SECONDS,
      );
      return ok(c, { mfaRequired: true, mfaToken });
    }
    if (requiredRoles.includes(auth.roleName)) {
      const mfaToken = await signEphemeralToken(
        { purpose: "mfa_setup", tenantId: auth.tenantId, userId: auth.userId },
        jwtConfig,
        MFA_SETUP_TTL_SECONDS,
      );
      return ok(c, { mfaSetupRequired: true, mfaToken });
    }

    const token = await signAccessToken(auth, jwtConfig);
    return ok(c, { token, expiresIn: 15 * 60, auth });
  });

  return app;
}

function parseMfaRequiredRoles(value: unknown): string[] {
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value;
  return [];
}

/** Signup auto-logs the newly-created admin in, since the very next step is the onboarding wizard. */
async function mintTokenForAdmin(db: Database, tenantId: string, env: Env) {
  const auth = await withTenant(db, tenantId, async (tx) => {
    const [user] = await tx.select().from(users).where(eq(users.tenantId, tenantId));
    if (!user) throw new Error("Failed to load newly-created admin user");
    return buildAuthContext(tx, tenantId, user);
  });
  const token = await signAccessToken(auth, { signingKey: env.JWT_SIGNING_KEY, kid: env.JWT_KID });
  return { token, expiresIn: 15 * 60, auth };
}

/** Shared with routes/mfa.ts and routes/sso.ts, which complete login via a different challenge than a password. */
export async function buildAuthContext(
  tx: Database,
  tenantId: string,
  user: { id: string; roleId: string; name: string; email: string },
): Promise<AuthContext> {
  const [role] = await tx.select().from(roles).where(eq(roles.id, user.roleId));
  const permissionRows = await tx
    .select({ key: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, user.roleId));
  const [employee] = await tx.select().from(employees).where(eq(employees.userId, user.id));

  return {
    tenantId,
    userId: user.id,
    employeeId: employee?.id ?? null,
    roleId: user.roleId,
    roleName: role?.name ?? "unknown",
    permissions: permissionRows.map((p) => p.key as Permission),
  };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "23505";
}
