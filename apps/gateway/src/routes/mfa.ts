import { Hono, type Context } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  buildOtpauthUri,
  decryptSecret,
  encryptSecret,
  generateBackupCodes,
  generateTotpSecret,
  hashBackupCode,
  signAccessToken,
  verifyAccessToken,
  verifyEphemeralToken,
  verifyTotp,
} from "@hrm/auth";
import { schema, withTenant } from "@hrm/db";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, ok } from "../lib/response";
import { buildAuthContext } from "./auth";

const { mfaTotpCredentials, users } = schema;

interface MfaTokenPayload {
  [key: string]: unknown;
  purpose: "mfa" | "mfa_setup";
  tenantId: string;
  userId: string;
}

type Actor = { tenantId: string; userId: string; viaBearer: boolean };

/**
 * MFA routes need to work for two very different callers: a fully logged-in
 * user managing their own MFA (bearer access token), and someone mid-login
 * who doesn't have a real session yet (the narrowly-scoped `mfaToken` from
 * the /login response). Each route declares which ephemeral-token purposes
 * it accepts; a bearer token is always accepted since it's strictly more
 * privileged than any ephemeral token.
 */
async function resolveActor(
  c: Context<{ Bindings: Env }>,
  jwtConfig: { signingKey: string; kid: string },
  mfaToken: string | undefined,
  allowedPurposes: MfaTokenPayload["purpose"][],
): Promise<Actor | null> {
  const authHeader = c.req.header("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const auth = await verifyAccessToken(authHeader.slice("Bearer ".length), jwtConfig);
      return { tenantId: auth.tenantId, userId: auth.userId, viaBearer: true };
    } catch {
      return null;
    }
  }
  if (mfaToken) {
    try {
      const payload = await verifyEphemeralToken<MfaTokenPayload>(mfaToken, jwtConfig);
      if (!allowedPurposes.includes(payload.purpose)) return null;
      return { tenantId: payload.tenantId, userId: payload.userId, viaBearer: false };
    } catch {
      return null;
    }
  }
  return null;
}

const verifySchema = z.object({ mfaToken: z.string().min(1), code: z.string().min(1) });
const enrollStartSchema = z.object({ mfaToken: z.string().optional() });
const enrollConfirmSchema = z.object({ mfaToken: z.string().optional(), code: z.string().min(1) });
const disableSchema = z.object({ code: z.string().min(1) });

export function mfaRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/status", async (c) => {
    const jwtConfig = { signingKey: c.env.JWT_SIGNING_KEY, kid: c.env.JWT_KID };
    const actor = await resolveActor(c, jwtConfig, undefined, []);
    if (!actor?.viaBearer) return fail(c, 401, "UNAUTHENTICATED", "Sign in is required.");

    const db = getDb(c.env.APP_DATABASE_URL);
    const enabled = await withTenant(db, actor.tenantId, async (tx) => {
      const [cred] = await tx.select().from(mfaTotpCredentials).where(eq(mfaTotpCredentials.userId, actor.userId));
      return cred?.enabled ?? false;
    });
    return ok(c, { enabled });
  });

  app.post("/verify", async (c) => {
    const parsed = verifySchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid MFA verify payload", parsed.error.flatten());

    const jwtConfig = { signingKey: c.env.JWT_SIGNING_KEY, kid: c.env.JWT_KID };
    const actor = await resolveActor(c, jwtConfig, parsed.data.mfaToken, ["mfa"]);
    if (!actor) return fail(c, 401, "INVALID_TOKEN", "MFA challenge token is invalid or expired.");

    const db = getDb(c.env.APP_DATABASE_URL);
    const auth = await withTenant(db, actor.tenantId, async (tx) => {
      const [cred] = await tx.select().from(mfaTotpCredentials).where(eq(mfaTotpCredentials.userId, actor.userId));
      if (!cred?.enabled) return null;

      const secret = await decryptSecret(cred.secretCiphertext, c.env.APP_ENCRYPTION_KEY);
      const codeValid = await verifyTotp(secret, parsed.data.code);
      if (!codeValid) {
        const codeHash = await hashBackupCode(parsed.data.code);
        const backupHashes = cred.backupCodeHashes as string[];
        if (!backupHashes.includes(codeHash)) return null;

        await tx
          .update(mfaTotpCredentials)
          .set({ backupCodeHashes: backupHashes.filter((h) => h !== codeHash), updatedAt: new Date() })
          .where(eq(mfaTotpCredentials.userId, actor.userId));
      }

      const [user] = await tx.select().from(users).where(eq(users.id, actor.userId));
      if (!user) return null;
      return buildAuthContext(tx, actor.tenantId, user);
    });

    if (!auth) return fail(c, 401, "INVALID_MFA_CODE", "Incorrect authentication code.");
    const token = await signAccessToken(auth, jwtConfig);
    return ok(c, { token, expiresIn: 15 * 60, auth });
  });

  app.post("/enroll/start", async (c) => {
    const parsed = enrollStartSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid enroll payload", parsed.error.flatten());

    const jwtConfig = { signingKey: c.env.JWT_SIGNING_KEY, kid: c.env.JWT_KID };
    const actor = await resolveActor(c, jwtConfig, parsed.data.mfaToken, ["mfa_setup"]);
    if (!actor) return fail(c, 401, "UNAUTHENTICATED", "Sign in (or a valid setup token) is required to enroll MFA.");

    const db = getDb(c.env.APP_DATABASE_URL);
    const result = await withTenant(db, actor.tenantId, async (tx) => {
      const [existing] = await tx.select().from(mfaTotpCredentials).where(eq(mfaTotpCredentials.userId, actor.userId));
      if (existing?.enabled) return { alreadyEnabled: true as const };

      const [user] = await tx.select().from(users).where(eq(users.id, actor.userId));
      if (!user) return { alreadyEnabled: false as const, notFound: true as const };

      const secret = generateTotpSecret();
      const backupCodes = generateBackupCodes();
      const backupCodeHashes = await Promise.all(backupCodes.map(hashBackupCode));
      const secretCiphertext = await encryptSecret(secret, c.env.APP_ENCRYPTION_KEY);

      if (existing) {
        await tx
          .update(mfaTotpCredentials)
          .set({ secretCiphertext, backupCodeHashes, enabled: false, updatedAt: new Date() })
          .where(eq(mfaTotpCredentials.userId, actor.userId));
      } else {
        await tx
          .insert(mfaTotpCredentials)
          .values({ tenantId: actor.tenantId, userId: actor.userId, secretCiphertext, backupCodeHashes, enabled: false });
      }

      const otpauthUri = buildOtpauthUri(secret, { issuer: "HRM", accountLabel: user.email });
      return { alreadyEnabled: false as const, secret, otpauthUri, backupCodes };
    });

    if (result.alreadyEnabled) {
      return fail(c, 409, "MFA_ALREADY_ENABLED", "MFA is already enabled. Disable it before re-enrolling.");
    }
    if ("notFound" in result) return fail(c, 404, "USER_NOT_FOUND", "User not found.");
    return ok(c, { secret: result.secret, otpauthUri: result.otpauthUri, backupCodes: result.backupCodes });
  });

  app.post("/enroll/confirm", async (c) => {
    const parsed = enrollConfirmSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid enroll payload", parsed.error.flatten());

    const jwtConfig = { signingKey: c.env.JWT_SIGNING_KEY, kid: c.env.JWT_KID };
    const actor = await resolveActor(c, jwtConfig, parsed.data.mfaToken, ["mfa_setup"]);
    if (!actor) return fail(c, 401, "UNAUTHENTICATED", "Sign in (or a valid setup token) is required to enroll MFA.");

    const db = getDb(c.env.APP_DATABASE_URL);
    const result = await withTenant(db, actor.tenantId, async (tx) => {
      const [cred] = await tx.select().from(mfaTotpCredentials).where(eq(mfaTotpCredentials.userId, actor.userId));
      if (!cred) return { ok: false as const };

      const secret = await decryptSecret(cred.secretCiphertext, c.env.APP_ENCRYPTION_KEY);
      const codeValid = await verifyTotp(secret, parsed.data.code);
      if (!codeValid) return { ok: false as const };

      await tx.update(mfaTotpCredentials).set({ enabled: true, updatedAt: new Date() }).where(eq(mfaTotpCredentials.userId, actor.userId));

      const [user] = await tx.select().from(users).where(eq(users.id, actor.userId));
      if (!user) return { ok: false as const };
      return { ok: true as const, auth: await buildAuthContext(tx, actor.tenantId, user) };
    });

    if (!result.ok) return fail(c, 401, "INVALID_MFA_CODE", "Incorrect authentication code.");

    // Forced setup-at-login (mfa_setup token, not a bearer session) completes login in the same step.
    if (!actor.viaBearer) {
      const token = await signAccessToken(result.auth, jwtConfig);
      return ok(c, { token, expiresIn: 15 * 60, auth: result.auth });
    }
    return ok(c, { enabled: true });
  });

  app.post("/disable", async (c) => {
    const parsed = disableSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid disable payload", parsed.error.flatten());

    const jwtConfig = { signingKey: c.env.JWT_SIGNING_KEY, kid: c.env.JWT_KID };
    const actor = await resolveActor(c, jwtConfig, undefined, []);
    if (!actor?.viaBearer) return fail(c, 401, "UNAUTHENTICATED", "Sign in is required to disable MFA.");

    const db = getDb(c.env.APP_DATABASE_URL);
    const disabled = await withTenant(db, actor.tenantId, async (tx) => {
      const [cred] = await tx.select().from(mfaTotpCredentials).where(eq(mfaTotpCredentials.userId, actor.userId));
      if (!cred?.enabled) return false;

      const secret = await decryptSecret(cred.secretCiphertext, c.env.APP_ENCRYPTION_KEY);
      let codeValid = await verifyTotp(secret, parsed.data.code);
      if (!codeValid) {
        const codeHash = await hashBackupCode(parsed.data.code);
        codeValid = (cred.backupCodeHashes as string[]).includes(codeHash);
      }
      if (!codeValid) return false;

      await tx.delete(mfaTotpCredentials).where(eq(mfaTotpCredentials.userId, actor.userId));
      return true;
    });

    if (!disabled) return fail(c, 401, "INVALID_MFA_CODE", "Incorrect authentication code.");
    return ok(c, { disabled: true });
  });

  return app;
}
