import { date, numeric, pgTable, smallint, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { tenants } from "./platform";
import { departments, designations, employees } from "./core";

export const jobOpenings = pgTable("job_openings", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  title: text("title").notNull(),
  departmentId: uuid("department_id").references(() => departments.id),
  // Same enum as employees.employmentType — the default a hired candidate's
  // employee record inherits unless overridden at hire time.
  employmentType: text("employment_type").notNull().default("full_time"),
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
  // Set only by the hire endpoint (apps/recruitment-service) — the durable
  // link proving "no manual data re-entry" and the idempotency guard against
  // hiring the same candidate twice.
  hiredEmployeeId: uuid("hired_employee_id").references(() => employees.id),
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
  status: text("status").notNull().default("scheduled"), // scheduled|completed|cancelled
  feedback: text("feedback"),
  rating: smallint("rating"),
  ...timestamps,
});

export const offers = pgTable("offers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  candidateId: uuid("candidate_id")
    .notNull()
    .references(() => candidates.id),
  designationId: uuid("designation_id").references(() => designations.id),
  offeredCtc: numeric("offered_ctc", { precision: 12, scale: 2 }).notNull(),
  joiningDate: date("joining_date").notNull(),
  status: text("status").notNull().default("pending"), // pending|accepted|declined|withdrawn
  ...timestamps,
});
