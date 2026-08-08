import { bigserial, boolean, inet, jsonb, pgTable, primaryKey, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  subdomain: text("subdomain").notNull().unique(),
  isolationTier: text("isolation_tier").notNull().default("pooled"), // pooled | isolated
  status: text("status").notNull().default("pending"), // pending | active | suspended
  plan: text("plan").notNull().default("trial"),
  onboardingStep: text("onboarding_step"),
  fiscalYearStartMonth: smallint("fiscal_year_start_month").notNull().default(4),
  defaultCurrency: text("default_currency").notNull().default("INR"),
  ...timestamps,
});

export const tenantSettings = pgTable(
  "tenant_settings",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.tenantId, table.key] }),
  }),
);

export const roles = pgTable("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  isSystemRole: boolean("is_system_role").notNull().default(false),
  ...timestamps,
});

export const permissions = pgTable("permissions", {
  key: text("key").primaryKey(), // e.g. 'leave.approve', 'payroll.run'
  description: text("description").notNull(),
});

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.roleId, table.permissionKey] }),
  }),
);

/**
 * Append-only, monthly range-partitioned by occurred_at (see migration 0002).
 * Service DB roles get INSERT only — UPDATE/DELETE are revoked so a compromised
 * service credential can't tamper with history (docs/architecture/06-security.md).
 */
export const auditLogs = pgTable("audit_logs", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  tenantId: uuid("tenant_id").notNull(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(), // e.g. 'employee.updated'
  resourceType: text("resource_type").notNull(),
  resourceId: uuid("resource_id"),
  before: jsonb("before"),
  after: jsonb("after"),
  ipAddress: inet("ip_address"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
});
