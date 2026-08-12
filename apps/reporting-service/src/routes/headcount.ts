import { Hono } from "hono";
import { eq, inArray, sql } from "drizzle-orm";
import { schema, withTenant, type Database } from "@hrm/db";
import type { Env } from "../env";
import { getDb } from "../db";
import { ok } from "../lib/response";
import { toCsv } from "../lib/csv";
import { resolveVisibleEmployeeIds } from "../lib/visibility";

const { employees, departments, designations, branches } = schema;

function employeeScopeWhere(visibleIds: string[] | null) {
  return visibleIds === null ? undefined : visibleIds.length > 0 ? inArray(employees.id, visibleIds) : sql`false`;
}

async function loadRows(tx: Database, visibleIds: string[] | null) {
  return tx
    .select({
      id: employees.id,
      employeeCode: employees.employeeCode,
      firstName: employees.firstName,
      lastName: employees.lastName,
      employmentType: employees.employmentType,
      status: employees.status,
      dateOfJoining: employees.dateOfJoining,
      departmentName: departments.name,
      designationTitle: designations.title,
      branchName: branches.name,
    })
    .from(employees)
    .leftJoin(departments, eq(employees.departmentId, departments.id))
    .leftJoin(designations, eq(employees.designationId, designations.id))
    .leftJoin(branches, eq(employees.branchId, branches.id))
    .where(employeeScopeWhere(visibleIds));
}

function groupCounts<T extends string | null>(rows: { key: T }[]): { key: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = row.key ?? "Unassigned";
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({ key, count }));
}

export function headcountRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", async (c) => {
    const auth = c.get("auth");

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      return loadRows(tx, visibleIds);
    });

    const active = rows.filter((r) => r.status === "active");
    return ok(c, {
      totalActive: active.length,
      totalInactive: rows.length - active.length,
      byDepartment: groupCounts(active.map((r) => ({ key: r.departmentName }))),
      byDesignation: groupCounts(active.map((r) => ({ key: r.designationTitle }))),
      byBranch: groupCounts(active.map((r) => ({ key: r.branchName }))),
      byEmploymentType: groupCounts(active.map((r) => ({ key: r.employmentType }))),
    });
  });

  app.get("/export", async (c) => {
    const auth = c.get("auth");

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      return loadRows(tx, visibleIds);
    });

    const csv = toCsv(
      rows.map((r) => ({
        employeeCode: r.employeeCode,
        firstName: r.firstName,
        lastName: r.lastName,
        department: r.departmentName ?? "",
        designation: r.designationTitle ?? "",
        branch: r.branchName ?? "",
        employmentType: r.employmentType,
        status: r.status,
        dateOfJoining: r.dateOfJoining,
      })),
      [
        { key: "employeeCode", header: "Employee Code" },
        { key: "firstName", header: "First Name" },
        { key: "lastName", header: "Last Name" },
        { key: "department", header: "Department" },
        { key: "designation", header: "Designation" },
        { key: "branch", header: "Branch" },
        { key: "employmentType", header: "Employment Type" },
        { key: "status", header: "Status" },
        { key: "dateOfJoining", header: "Date of Joining" },
      ],
    );

    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=headcount.csv" },
    });
  });

  return app;
}
