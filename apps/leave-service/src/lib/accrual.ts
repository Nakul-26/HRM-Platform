import { and, eq, isNull } from "drizzle-orm";
import { schema, withTenant, type Database } from "@hrm/db";
import type { LeaveAccrualRule, LeaveAccrualRunResult } from "@hrm/types";

const { tenants, leaveTypes, employees, leaveBalances } = schema;

/** "2026-08" for a monthly rule, "2026" for a yearly one — the accrual "period" an employee/leave-type pair either has or hasn't received yet. */
export function currentPeriodKey(rule: LeaveAccrualRule, now: Date): string {
  const year = now.getUTCFullYear();
  if (rule.per === "month") {
    const month = String(now.getUTCMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }
  return String(year);
}

/**
 * Runs for every tenant by default (`tenants` carries no tenant_id column
 * itself, so it's outside RLS — see packages/db/src/rls/enable-rls.sql's
 * tenant_tables list) — this is what the Cron Trigger uses. Pass `tenantId`
 * to scope it to one tenant instead: the authenticated manual-trigger
 * endpoint (`POST /api/v1/leave/balances/accrual/run`) always does this, so
 * one tenant's admin can never cause a side effect on another tenant's data
 * just by calling an endpoint scoped to their own token.
 *
 * For every (active employee) x (leave type with an accrual rule) pair,
 * upserts the matching `leaveBalances` row. Idempotent per period via
 * `lastAccrualPeriod`: calling this twice within the same month/year for
 * the same rule is a no-op the second time.
 */
export async function accrueLeaveBalances(
  db: Database,
  options: { now?: Date; tenantId?: string } = {},
): Promise<LeaveAccrualRunResult> {
  const now = options.now ?? new Date();
  const allTenants = options.tenantId
    ? [{ id: options.tenantId }]
    : await db.select({ id: tenants.id }).from(tenants);
  const year = now.getUTCFullYear();

  let balancesUpdated = 0;

  for (const tenant of allTenants) {
    balancesUpdated += await withTenant(db, tenant.id, async (tx) => {
      const types = await tx.select().from(leaveTypes).where(isNull(leaveTypes.deletedAt));
      const accruableTypes = types.filter(
        (t): t is typeof t & { accrualRule: LeaveAccrualRule } => t.accrualRule !== null,
      );
      if (accruableTypes.length === 0) return 0;

      const activeEmployees = await tx
        .select({ id: employees.id })
        .from(employees)
        .where(eq(employees.status, "active"));
      if (activeEmployees.length === 0) return 0;

      let updated = 0;
      for (const leaveType of accruableTypes) {
        const rule = leaveType.accrualRule;
        const periodKey = currentPeriodKey(rule, now);

        for (const employee of activeEmployees) {
          const balanceKey = and(
            eq(leaveBalances.tenantId, tenant.id),
            eq(leaveBalances.employeeId, employee.id),
            eq(leaveBalances.leaveTypeId, leaveType.id),
            eq(leaveBalances.year, year),
          );

          const [existing] = await tx.select().from(leaveBalances).where(balanceKey);

          if (!existing) {
            await tx.insert(leaveBalances).values({
              tenantId: tenant.id,
              employeeId: employee.id,
              leaveTypeId: leaveType.id,
              year,
              entitled: String(rule.days),
              lastAccrualPeriod: periodKey,
            });
            updated += 1;
          } else if (existing.lastAccrualPeriod !== periodKey) {
            await tx
              .update(leaveBalances)
              .set({ entitled: String(Number(existing.entitled) + rule.days), lastAccrualPeriod: periodKey })
              .where(balanceKey);
            updated += 1;
          }
        }
      }
      return updated;
    });
  }

  return { tenantsProcessed: allTenants.length, balancesUpdated };
}
