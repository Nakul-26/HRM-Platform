import { z } from "zod";

export const employmentTypeSchema = z.enum(["full_time", "part_time", "contract", "intern"]);
export type EmploymentType = z.infer<typeof employmentTypeSchema>;

export const employeeStatusSchema = z.enum(["active", "on_leave", "terminated"]);
export type EmployeeStatus = z.infer<typeof employeeStatusSchema>;

export const departmentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(200),
  parentDepartmentId: z.string().uuid().nullable(),
});
export type Department = z.infer<typeof departmentSchema>;

export const createDepartmentSchema = departmentSchema.pick({ name: true }).extend({
  parentDepartmentId: z.string().uuid().optional(),
});
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export const updateDepartmentSchema = createDepartmentSchema.partial();
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>;

export const branchSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(200),
  address: z.record(z.string(), z.unknown()).nullable(),
  timezone: z.string().min(1),
});
export type Branch = z.infer<typeof branchSchema>;

export const createBranchSchema = branchSchema.pick({ name: true }).extend({
  address: z.record(z.string(), z.unknown()).optional(),
  timezone: z.string().min(1).optional(),
});
export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export const updateBranchSchema = createBranchSchema.partial();
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;

export const designationSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  title: z.string().min(1).max(200),
  grade: z.string().nullable(),
});
export type Designation = z.infer<typeof designationSchema>;

export const createDesignationSchema = designationSchema.pick({ title: true }).extend({
  grade: z.string().min(1).optional(),
});
export type CreateDesignationInput = z.infer<typeof createDesignationSchema>;
export const updateDesignationSchema = createDesignationSchema.partial();
export type UpdateDesignationInput = z.infer<typeof updateDesignationSchema>;

export const employeeSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  userId: z.string().uuid().nullable(),
  employeeCode: z.string().min(1).max(50),
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  personalEmail: z.string().email().nullable(),
  workEmail: z.string().email().nullable(),
  phone: z.string().min(1).max(30).nullable(),
  departmentId: z.string().uuid().nullable(),
  designationId: z.string().uuid().nullable(),
  branchId: z.string().uuid().nullable(),
  managerId: z.string().uuid().nullable(),
  employmentType: employmentTypeSchema,
  dateOfJoining: z.string(), // ISO date (YYYY-MM-DD), stored as a Postgres `date` column
  dateOfExit: z.string().nullable(),
  status: employeeStatusSchema,
});
export type Employee = z.infer<typeof employeeSchema>;

export const createEmployeeSchema = employeeSchema
  .pick({
    employeeCode: true,
    firstName: true,
    lastName: true,
    employmentType: true,
    dateOfJoining: true,
  })
  .extend({
    personalEmail: z.string().email().optional(),
    workEmail: z.string().email().optional(),
    phone: z.string().min(1).max(30).optional(),
    departmentId: z.string().uuid().optional(),
    designationId: z.string().uuid().optional(),
    branchId: z.string().uuid().optional(),
    managerId: z.string().uuid().optional(),
  });
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;

export const updateEmployeeSchema = createEmployeeSchema.partial();
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>;

/** Fields an employee may change on their own record via self-service — never org-structure or status. */
export const updateSelfEmployeeSchema = z.object({
  personalEmail: z.string().email().optional(),
  phone: z.string().min(1).max(30).optional(),
});
export type UpdateSelfEmployeeInput = z.infer<typeof updateSelfEmployeeSchema>;

/** One row of the bulk-onboarding CSV import (docs/architecture/10-roadmap.md, Phase 1). */
export const employeeCsvRowSchema = z.object({
  employee_code: z.string().min(1).max(50),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(100),
  personal_email: z.string().email().optional().or(z.literal("")),
  work_email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(30).optional().or(z.literal("")),
  department_name: z.string().max(200).optional().or(z.literal("")),
  designation_title: z.string().max(200).optional().or(z.literal("")),
  branch_name: z.string().max(200).optional().or(z.literal("")),
  manager_employee_code: z.string().max(50).optional().or(z.literal("")),
  employment_type: employmentTypeSchema,
  date_of_joining: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
});
export type EmployeeCsvRow = z.infer<typeof employeeCsvRowSchema>;

export interface EmployeeCsvRowError {
  row: number; // 1-indexed, matching the CSV line a spreadsheet user would see (header excluded)
  errors: string[];
}

export interface EmployeeCsvImportResult {
  imported: number;
  errors: EmployeeCsvRowError[];
}

export const documentTypeSchema = z.enum(["id_proof", "contract", "certificate", "other"]);
export type DocumentType = z.infer<typeof documentTypeSchema>;

export const employeeDocumentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  documentType: documentTypeSchema,
  r2ObjectKey: z.string().min(1),
  uploadedBy: z.string().uuid().nullable(),
});
export type EmployeeDocument = z.infer<typeof employeeDocumentSchema>;

/** `objectKey` comes from the Document service's presign-upload response — see apps/document-service. */
export const createEmployeeDocumentSchema = z.object({
  documentType: documentTypeSchema,
  objectKey: z.string().min(1),
});
export type CreateEmployeeDocumentInput = z.infer<typeof createEmployeeDocumentSchema>;
