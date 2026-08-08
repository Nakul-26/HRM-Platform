import { bigserial, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./platform";
import { employees } from "./core";

export const notifications = pgTable(
  "notifications",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    recipientId: uuid("recipient_id")
      .notNull()
      .references(() => employees.id),
    channel: text("channel").notNull(), // email | sms | push | in_app
    templateKey: text("template_key").notNull(),
    status: text("status").notNull().default("queued"), // queued | sent | failed
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    // Partial index: partial-index config isn't first-class in drizzle-kit's typed
    // builder yet, so the `WHERE read_at IS NULL` clause is added in migration 0002.
    recipientIdx: index("idx_notifications_recipient").on(table.tenantId, table.recipientId),
  }),
);
