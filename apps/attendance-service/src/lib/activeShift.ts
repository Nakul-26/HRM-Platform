import { and, desc, eq, lte, or, gte, isNull } from "drizzle-orm";
import { schema, type Database } from "@hrm/db";

const { employeeShiftAssignments, shiftTemplates } = schema;

/**
 * Resolves the shift template covering a given employee/work-date, if any —
 * the assignment with the latest `effectiveFrom` whose range contains
 * `workDate`. Shared by clock-in/out (late/overtime calc) and correction
 * approval (recalculating late/overtime after a requested time change).
 */
export async function resolveActiveShift(
  tx: Database,
  tenantId: string,
  employeeId: string,
  workDate: string,
): Promise<typeof shiftTemplates.$inferSelect | null> {
  const [row] = await tx
    .select({ shift: shiftTemplates })
    .from(employeeShiftAssignments)
    .innerJoin(shiftTemplates, eq(employeeShiftAssignments.shiftTemplateId, shiftTemplates.id))
    .where(
      and(
        eq(employeeShiftAssignments.tenantId, tenantId),
        eq(employeeShiftAssignments.employeeId, employeeId),
        lte(employeeShiftAssignments.effectiveFrom, workDate),
        or(isNull(employeeShiftAssignments.effectiveTo), gte(employeeShiftAssignments.effectiveTo, workDate)),
      ),
    )
    .orderBy(desc(employeeShiftAssignments.effectiveFrom))
    .limit(1);
  return row?.shift ?? null;
}
