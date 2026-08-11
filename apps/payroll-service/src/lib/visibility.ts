import { eq } from "drizzle-orm";
import { schema, type Database } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { hasPermission, type AuthContext } from "@hrm/types";

const { employees } = schema;

/** Rows the caller may see: org-wide (`null`) if `payroll.view_all`, else self + direct reports if `payroll.view`, else self only. Same shape as apps/attendance-service's `resolveVisibleEmployeeIds`. */
export async function resolveVisibleEmployeeIds(tx: Database, auth: AuthContext): Promise<string[] | null> {
  if (hasPermission(auth, "payroll.view_all")) return null;

  const ids: string[] = [];
  if (auth.employeeId) {
    ids.push(auth.employeeId);
    if (canUnscoped(auth, "payroll.view")) {
      const reports = await tx.select({ id: employees.id }).from(employees).where(eq(employees.managerId, auth.employeeId));
      ids.push(...reports.map((r) => r.id));
    }
  }
  return ids;
}
