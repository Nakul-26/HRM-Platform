import { pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { tenants } from "./platform";
import { departments, employees } from "./core";

export const jobOpenings = pgTable("job_openings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  title: text("title").notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  status: text("status").notNull().default("open"),
  ...timestamps,
});

export const candidates = pgTable("candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  jobOpeningId: uuid("job_opening_id")
    .notNull()
    .references(() => jobOpenings.id),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  resumeR2Key: text("resume_r2_key"),
  pipelineStage: text("pipeline_stage").notNull().default("applied"), // applied|screening|interview|offer|hired|rejected
  ...timestamps,
});

export const interviews = pgTable("interviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id),
  interviewerId: uuid("interviewer_id").references(() => employees.id),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  feedback: text("feedback"),
  rating: smallint("rating"),
  ...timestamps,
});
