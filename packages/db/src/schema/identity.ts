import { boolean, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { tenants } from "./platform";
import { users } from "./auth";

/**
 * One OIDC connection per tenant (`tenantId` unique) — multiple IdPs per
 * tenant is a future enhancement, not needed for a first enterprise
 * customer. Endpoints are resolved once via OIDC discovery at connection-
 * setup time and cached here rather than re-fetched on every login.
 * `clientSecretCiphertext` is AES-256-GCM via @hrm/auth's secretBox,
 * never stored or returned in plaintext (docs/architecture/06-security.md,
 * "application-level encryption" for especially sensitive columns).
 */
export const ssoConnections = pgTable("sso_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id)
    .unique(),
  issuer: text("issuer").notNull(),
  clientId: text("client_id").notNull(),
  clientSecretCiphertext: text("client_secret_ciphertext").notNull(),
  authorizationEndpoint: text("authorization_endpoint").notNull(),
  tokenEndpoint: text("token_endpoint").notNull(),
  jwksUri: text("jwks_uri").notNull(),
  enabled: boolean("enabled").notNull().default(true),
  ...timestamps,
});

/**
 * TOTP MFA credential, one per user. `enabled: false` until the first code
 * is confirmed (see the enroll/start -> enroll/confirm flow in
 * apps/gateway/src/routes/auth.ts) so a half-finished enrollment never
 * silently locks a user out. `backupCodeHashes` are sha256 hex digests —
 * plaintext codes are shown to the user exactly once, at generation time,
 * and never stored.
 */
export const mfaTotpCredentials = pgTable("mfa_totp_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id)
    .unique(),
  secretCiphertext: text("secret_ciphertext").notNull(),
  backupCodeHashes: jsonb("backup_code_hashes").notNull().default([]),
  enabled: boolean("enabled").notNull().default(false),
  ...timestamps,
});
