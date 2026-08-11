import { and, eq, gte, lte } from "drizzle-orm";
import { schema, type Database } from "@hrm/db";

const { holidayCalendar } = schema;

/**
 * Lists weekdays (Mon-Fri) between `startDate` and `endDate` inclusive,
 * excluding any date in the tenant's holiday calendar — same logic as
 * apps/leave-service/src/lib/leaveDays.ts's `enumerateBusinessDays`,
 * duplicated per the established small-duplication convention rather than a
 * new shared package. Used by the payroll engine to compute a period's
 * working-day count for loss-of-pay calculation.
 */
export function enumerateBusinessDays(startDate: string, endDate: string, holidayDates: string[] = []): string[] {
  const holidaySet = new Set(holidayDates);
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const dates: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dayOfWeek = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const iso = cursor.toISOString().slice(0, 10);
    if (!isWeekend && !holidaySet.has(iso)) dates.push(iso);
  }
  return dates;
}

/** Holiday dates covering the period, applicable to `branchId` (or org-wide, `branchId: null`). */
export async function fetchHolidayDates(
  tx: Database,
  tenantId: string,
  branchId: string | null,
  startDate: string,
  endDate: string,
): Promise<string[]> {
  const rows = await tx
    .select({ date: holidayCalendar.date, branchId: holidayCalendar.branchId })
    .from(holidayCalendar)
    .where(and(eq(holidayCalendar.tenantId, tenantId), gte(holidayCalendar.date, startDate), lte(holidayCalendar.date, endDate)));

  return rows.filter((r) => r.branchId === null || r.branchId === branchId).map((r) => r.date);
}
