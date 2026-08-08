import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Database } from "@hrm/db";
import { accounts, sessions, users, verifications } from "@hrm/db/schema";

export interface BetterAuthConfig {
  db: Database;
  /** Comma-less list of trusted origins, e.g. tenant subdomains at the edge. */
  trustedOrigins: string[];
  secret: string;
}

/**
 * `tenants` here is this project's own table (docs/architecture/03-multi-tenancy.md),
 * not Better Auth's built-in organization plugin — `tenantId` is wired in as
 * an additional field on `user` instead, so RLS (which key on tenant_id) can
 * cover auth data the same way it covers every other table.
 */
export function createAuth(config: BetterAuthConfig) {
  return betterAuth({
    secret: config.secret,
    trustedOrigins: config.trustedOrigins,
    database: drizzleAdapter(config.db, {
      provider: "pg",
      schema: { user: users, session: sessions, account: accounts, verification: verifications },
    }),
    user: {
      additionalFields: {
        tenantId: { type: "string", required: true, input: true },
      },
    },
    emailAndPassword: {
      enabled: true,
      // k-anonymity HIBP check happens in a `before` hook wired at the
      // identity-service call site, not here, so this package stays
      // provider-agnostic and testable without a network call.
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days, refreshed on activity
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
  });
}
