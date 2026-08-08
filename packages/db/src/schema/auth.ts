import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { roles, tenants } from "./platform";

/**
 * Better Auth-owned tables (standard names it expects from the Drizzle adapter).
 * `tenantId` is added as an additional field so RLS can apply to auth data too —
 * Better Auth's own multi-tenancy plugin models orgs differently, but this
 * project uses its own `tenants` table (see docs/architecture/03-multi-tenancy.md),
 * so tenant scoping is layered on top of Better Auth's default schema instead.
 */
export const users = pgTable(
  "user",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    // Every login-capable identity has exactly one role (docs/architecture/06-security.md).
    // Lives on `user`, not `employees`, because a user must resolve to a role
    // the moment they authenticate, before any employee-record lookup happens.
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    name: text("name").notNull(),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantEmailUnique: uniqueIndex("user_tenant_email_unique").on(table.tenantId, table.email),
  }),
);

export const sessions = pgTable("session", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const accounts = pgTable("account", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  providerId: text("provider_id").notNull(), // 'credential' | 'google' | ...
  accountId: text("account_id").notNull(),
  passwordHash: text("password_hash"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verifications = pgTable("verification", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identifier").notNull(), // email or phone being verified
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
