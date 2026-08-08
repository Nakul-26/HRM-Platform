export interface HolidayDate {
  date: string; // ISO date (YYYY-MM-DD)
}

/**
 * Counts weekdays (Mon-Fri) between `startDate` and `endDate` inclusive,
 * excluding any date present in `holidays`. Never trust a client-sent day
 * count — this is always recomputed server-side from the raw date range.
 */
export function calculateLeaveDays(startDate: string, endDate: string, holidays: HolidayDate[] = []): number {
  const holidaySet = new Set(holidays.map((h) => h.date));
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;

  let days = 0;
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const dayOfWeek = cursor.getUTCDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const iso = cursor.toISOString().slice(0, 10);
    if (!isWeekend && !holidaySet.has(iso)) days += 1;
  }
  return days;
}
