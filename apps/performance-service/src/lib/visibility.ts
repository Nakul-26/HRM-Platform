import { eq } from "drizzle-orm";
import { schema, type Database } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { hasPermission, type AuthContext } from "@hrm/types";

const { employees } = schema;

/** Rows the caller may see: org-wide (`null`) if `performance.view_all`, else self + direct reports if `performance.view`, else self only. Same shape as apps/payroll-service's `resolveVisibleEmployeeIds`. */
export async function resolveVisibleEmployeeIds(tx: Database, auth: AuthContext): Promise<string[] | null> {
  if (hasPermission(auth, "performance.view_all")) return null;

  const ids: string[] = [];
  if (auth.employeeId) {
    ids.push(auth.employeeId);
    if (canUnscoped(auth, "performance.view")) {
      const reports = await tx.select({ id: employees.id }).from(employees).where(eq(employees.managerId, auth.employeeId));
      ids.push(...reports.map((r) => r.id));
    }
  }
  return ids;
}
