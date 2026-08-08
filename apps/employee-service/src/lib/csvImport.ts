import { parse } from "csv-parse/sync";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { schema, type Database } from "@hrm/db";
import {
  employeeCsvRowSchema,
  type EmployeeCsvImportResult,
  type EmployeeCsvRow,
  type EmployeeCsvRowError,
} from "@hrm/types";

const { employees, departments, branches, designations } = schema;

function uniqueNonEmpty(values: (string | undefined)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))];
}

/** Parses + validates raw CSV text row-by-row. Pure, no DB access — unit-testable in isolation. */
export function parseEmployeeCsv(csvText: string): { rows: EmployeeCsvRow[]; errors: EmployeeCsvRowError[] } {
  let records: Record<string, string>[];
  try {
    records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
  } catch (err) {
    return { rows: [], errors: [{ row: 0, errors: [`Could not parse CSV: ${(err as Error).message}`] }] };
  }

  const rows: EmployeeCsvRow[] = [];
  const errors: EmployeeCsvRowError[] = [];
  const seenCodes = new Set<string>();

  records.forEach((record, index) => {
    const parsed = employeeCsvRowSchema.safeParse(record);
    if (!parsed.success) {
      errors.push({
        row: index + 1,
        errors: parsed.error.issues.map((issue) => `${issue.path.join(".") || "(row)"}: ${issue.message}`),
      });
      return;
    }
    if (seenCodes.has(parsed.data.employee_code)) {
      errors.push({
        row: index + 1,
        errors: [`Duplicate employee_code "${parsed.data.employee_code}" within this file`],
      });
      return;
    }
    seenCodes.add(parsed.data.employee_code);
    rows.push(parsed.data);
  });

  return { rows, errors };
}

async function resolveDepartments(tx: Database, tenantId: string, names: string[]): Promise<Map<string, string>> {
  if (names.length === 0) return new Map();
  const existing = await tx
    .select({ id: departments.id, name: departments.name })
    .from(departments)
    .where(and(eq(departments.tenantId, tenantId), inArray(departments.name, names), isNull(departments.deletedAt)));
  const map = new Map(existing.map((r) => [r.name, r.id]));
  const missing = names.filter((n) => !map.has(n));
  if (missing.length > 0) {
    const created = await tx
      .insert(departments)
      .values(missing.map((name) => ({ tenantId, name })))
      .returning({ id: departments.id, name: departments.name });
    created.forEach((r) => map.set(r.name, r.id));
  }
  return map;
}

async function resolveBranches(tx: Database, tenantId: string, names: string[]): Promise<Map<string, string>> {
  if (names.length === 0) return new Map();
  const existing = await tx
    .select({ id: branches.id, name: branches.name })
    .from(branches)
    .where(and(eq(branches.tenantId, tenantId), inArray(branches.name, names), isNull(branches.deletedAt)));
  const map = new Map(existing.map((r) => [r.name, r.id]));
  const missing = names.filter((n) => !map.has(n));
  if (missing.length > 0) {
    const created = await tx
      .insert(branches)
      .values(missing.map((name) => ({ tenantId, name })))
      .returning({ id: branches.id, name: branches.name });
    created.forEach((r) => map.set(r.name, r.id));
  }
  return map;
}

async function resolveDesignations(tx: Database, tenantId: string, titles: string[]): Promise<Map<string, string>> {
  if (titles.length === 0) return new Map();
  const existing = await tx
    .select({ id: designations.id, title: designations.title })
    .from(designations)
    .where(
      and(eq(designations.tenantId, tenantId), inArray(designations.title, titles), isNull(designations.deletedAt)),
    );
  const map = new Map(existing.map((r) => [r.title, r.id]));
  const missing = titles.filter((t) => !map.has(t));
  if (missing.length > 0) {
    const created = await tx
      .insert(designations)
      .values(missing.map((title) => ({ tenantId, title })))
      .returning({ id: designations.id, title: designations.title });
    created.forEach((r) => map.set(r.title, r.id));
  }
  return map;
}

/**
 * Bulk-onboards a validated batch of CSV rows within the caller's `withTenant`
 * transaction (docs/architecture/10-roadmap.md, Phase 1 "onboard a real org
 * end-to-end with no manual DB intervention"). All-or-nothing by construction:
 * every conflict (duplicate employee_code, unresolvable manager reference) is
 * checked BEFORE any write, so a bad row never leaves a half-imported roster
 * that a corrected re-upload would then collide with.
 */
export async function importEmployeesFromCsv(
  tx: Database,
  tenantId: string,
  rows: EmployeeCsvRow[],
): Promise<EmployeeCsvImportResult> {
  if (rows.length === 0) return { imported: 0, errors: [] };

  const errors: EmployeeCsvRowError[] = [];
  const codesInFile = new Set(rows.map((r) => r.employee_code));

  const existingCodeRows = await tx
    .select({ code: employees.employeeCode })
    .from(employees)
    .where(and(eq(employees.tenantId, tenantId), inArray(employees.employeeCode, [...codesInFile])));
  const existingCodes = new Set(existingCodeRows.map((r) => r.code));
  rows.forEach((row, index) => {
    if (existingCodes.has(row.employee_code)) {
      errors.push({ row: index + 1, errors: [`employee_code "${row.employee_code}" already exists`] });
    }
  });

  const managerCodesToResolve = uniqueNonEmpty(
    rows.map((r) => (r.manager_employee_code && !codesInFile.has(r.manager_employee_code) ? r.manager_employee_code : undefined)),
  );
  const existingManagerRows = managerCodesToResolve.length
    ? await tx
        .select({ id: employees.id, code: employees.employeeCode })
        .from(employees)
        .where(and(eq(employees.tenantId, tenantId), inArray(employees.employeeCode, managerCodesToResolve)))
    : [];
  const existingManagerIdByCode = new Map(existingManagerRows.map((r) => [r.code, r.id]));

  rows.forEach((row, index) => {
    if (
      row.manager_employee_code &&
      !codesInFile.has(row.manager_employee_code) &&
      !existingManagerIdByCode.has(row.manager_employee_code)
    ) {
      errors.push({ row: index + 1, errors: [`manager_employee_code "${row.manager_employee_code}" was not found`] });
    }
  });

  if (errors.length > 0) return { imported: 0, errors };

  const [departmentIdByName, branchIdByName, designationIdByTitle] = await Promise.all([
    resolveDepartments(tx, tenantId, uniqueNonEmpty(rows.map((r) => r.department_name))),
    resolveBranches(tx, tenantId, uniqueNonEmpty(rows.map((r) => r.branch_name))),
    resolveDesignations(tx, tenantId, uniqueNonEmpty(rows.map((r) => r.designation_title))),
  ]);

  const inserted = await tx
    .insert(employees)
    .values(
      rows.map((row) => ({
        tenantId,
        employeeCode: row.employee_code,
        firstName: row.first_name,
        lastName: row.last_name,
        personalEmail: row.personal_email || undefined,
        workEmail: row.work_email || undefined,
        phone: row.phone || undefined,
        departmentId: row.department_name ? departmentIdByName.get(row.department_name) : undefined,
        designationId: row.designation_title ? designationIdByTitle.get(row.designation_title) : undefined,
        branchId: row.branch_name ? branchIdByName.get(row.branch_name) : undefined,
        employmentType: row.employment_type,
        dateOfJoining: row.date_of_joining,
        status: "active" as const,
      })),
    )
    .returning({ id: employees.id, employeeCode: employees.employeeCode });

  const idByCode = new Map(inserted.map((r) => [r.employeeCode, r.id]));

  // Second pass: link managers now that every row in this file has an id,
  // whether the manager was created in this same batch or already existed.
  for (const row of rows) {
    if (!row.manager_employee_code) continue;
    const managerId = idByCode.get(row.manager_employee_code) ?? existingManagerIdByCode.get(row.manager_employee_code);
    const employeeId = idByCode.get(row.employee_code);
    if (managerId && employeeId) {
      await tx.update(employees).set({ managerId }).where(eq(employees.id, employeeId));
    }
  }

  return { imported: inserted.length, errors: [] };
}
