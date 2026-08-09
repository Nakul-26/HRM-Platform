export interface ShiftWindowInput {
  startTime: string; // "HH:MM" or "HH:MM:SS"
  endTime: string;
  graceMinutes?: number;
}

function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function dateFromWorkDateAndMinutes(workDate: string, minutes: number, dayOffset: number): Date {
  const [y, mo, d] = workDate.split("-").map(Number);
  const base = new Date(Date.UTC(y ?? 1970, (mo ?? 1) - 1, (d ?? 1) + dayOffset));
  base.setUTCMinutes(base.getUTCMinutes() + minutes);
  return base;
}

/**
 * Resolves a shift template's start/end into real `Date`s for a given work
 * date. A shift "crosses midnight" whenever its end time-of-day is not after
 * its start time-of-day (e.g. 22:00-06:00) — detected from the actual times
 * rather than trusting `isNightShift`, which is informational/display-only.
 */
export function resolveShiftWindow(shift: ShiftWindowInput, workDate: string): { start: Date; end: Date } {
  const startMinutes = parseTimeToMinutes(shift.startTime);
  const endMinutes = parseTimeToMinutes(shift.endTime);
  const crossesMidnight = endMinutes <= startMinutes;
  return {
    start: dateFromWorkDateAndMinutes(workDate, startMinutes, 0),
    end: dateFromWorkDateAndMinutes(workDate, endMinutes, crossesMidnight ? 1 : 0),
  };
}

/** Minutes late beyond the shift's grace period; 0 if no shift, on time, or within grace. */
export function computeLateMinutes(shift: ShiftWindowInput | null, workDate: string, clockIn: Date): number {
  if (!shift) return 0;
  const { start } = resolveShiftWindow(shift, workDate);
  const graceEnd = new Date(start.getTime() + (shift.graceMinutes ?? 0) * 60_000);
  const diffMs = clockIn.getTime() - graceEnd.getTime();
  return diffMs > 0 ? Math.round(diffMs / 60_000) : 0;
}

/** Minutes worked past the shift's end time; 0 if no shift or clocked out on/before shift end. */
export function computeOvertimeMinutes(shift: ShiftWindowInput | null, workDate: string, clockOut: Date): number {
  if (!shift) return 0;
  const { end } = resolveShiftWindow(shift, workDate);
  const diffMs = clockOut.getTime() - end.getTime();
  return diffMs > 0 ? Math.round(diffMs / 60_000) : 0;
}
