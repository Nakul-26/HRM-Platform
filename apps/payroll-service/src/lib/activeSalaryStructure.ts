import { and, desc, eq, lte } from "drizzle-orm";
import { schema, type Database } from "@hrm/db";

const { salaryStructures } = schema;

/**
 * Resolves the salary structure in effect for an employee as of
 * `periodEndDate` — the row with the latest `effectiveFrom` that doesn't
 * exceed it. Unlike shift assignments, structures have no `effectiveTo`: a
 * later structure naturally supersedes an earlier one for any date on or
 * after its own `effectiveFrom`.
 */
export async function resolveActiveSalaryStructure(
  tx: Database,
  tenantId: string,
  employeeId: string,
  periodEndDate: string,
): Promise<typeof salaryStructures.$inferSelect | null> {
  const [row] = await tx
    .select()
    .from(salaryStructures)
    .where(
      and(
        eq(salaryStructures.tenantId, tenantId),
        eq(salaryStructures.employeeId, employeeId),
        lte(salaryStructures.effectiveFrom, periodEndDate),
      ),
    )
    .orderBy(desc(salaryStructures.effectiveFrom))
    .limit(1);
  return row ?? null;
}
