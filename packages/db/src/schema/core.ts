import { type AnyPgColumn, date, index, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { timestamps } from "./_shared";
import { tenants } from "./platform";
import { users } from "./auth";

export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  parentDepartmentId: uuid("parent_department_id"),
  ...timestamps,
});

export const branches = pgTable("branches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  name: text("name").notNull(),
  address: jsonb("address"),
  timezone: text("timezone").notNull().default("Asia/Kolkata"),
  ...timestamps,
});

export const designations = pgTable("designations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  title: text("title").notNull(),
  grade: text("grade"),
  ...timestamps,
});

export const employees = pgTable(
  "employees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    userId: uuid("user_id").references(() => users.id), // nullable pre-activation
    employeeCode: text("employee_code").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    personalEmail: text("personal_email"),
    workEmail: text("work_email"),
    phone: text("phone"),
    departmentId: uuid("department_id").references(() => departments.id),
    designationId: uuid("designation_id").references(() => designations.id),
    branchId: uuid("branch_id").references(() => branches.id),
    managerId: uuid("manager_id").references((): AnyPgColumn => employees.id),
    employmentType: text("employment_type").notNull(), // full_time | part_time | contract | intern
    dateOfJoining: date("date_of_joining").notNull(),
    dateOfExit: date("date_of_exit"),
    status: text("status").notNull().default("active"), // active | on_leave | terminated
    ...timestamps,
  },
  (table) => ({
    tenantCodeUnique: uniqueIndex("employees_tenant_code_unique").on(table.tenantId, table.employeeCode),
    tenantManagerIdx: index("idx_employees_tenant_manager").on(table.tenantId, table.managerId),
    tenantDepartmentIdx: index("idx_employees_tenant_department").on(table.tenantId, table.departmentId),
    tenantStatusIdx: index("idx_employees_tenant_status").on(table.tenantId, table.status),
  }),
);

export const employeeDocuments = pgTable("employee_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  employeeId: uuid("employee_id")
    .notNull()
    .references(() => employees.id),
  documentType: text("document_type").notNull(), // id_proof | contract | certificate | ...
  r2ObjectKey: text("r2_object_key").notNull(),
  uploadedBy: uuid("uploaded_by").references(() => employees.id),
  ...timestamps,
});
