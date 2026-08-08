import { date, numeric, pgTable, smallint, text, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { tenants } from "./platform";
import { employees } from "./core";

export const reviewCycles = pgTable("review_cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  status: text("status").notNull().default("open"),
  ...timestamps,
});

export const goals = pgTable("goals", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id),
  reviewCycleId: uuid("review_cycle_id").references(() => reviewCycles.id),
  title: text("title").notNull(),
  weight: smallint("weight"),
  progress: smallint("progress").notNull().default(0),
  ...timestamps,
});

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  reviewCycleId: uuid("review_cycle_id")
    .notNull()
    .references(() => reviewCycles.id),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id),
  reviewerId: uuid("reviewer_id")
    .notNull()
    .references(() => employees.id),
  rating: numeric("rating", { precision: 3, scale: 1 }),
  comments: text("comments"),
  ...timestamps,
});
