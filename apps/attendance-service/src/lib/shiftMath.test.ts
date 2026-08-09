import { describe, expect, it } from "vitest";
import { computeLateMinutes, computeOvertimeMinutes, resolveShiftWindow } from "./shiftMath";

const dayShift = { startTime: "09:00", endTime: "17:00", graceMinutes: 10 };
const nightShift = { startTime: "22:00", endTime: "06:00", graceMinutes: 0 };

describe("resolveShiftWindow", () => {
  it("resolves a same-day shift within the work date", () => {
    const { start, end } = resolveShiftWindow(dayShift, "2026-08-10");
    expect(start.toISOString()).toBe("2026-08-10T09:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-10T17:00:00.000Z");
  });

  it("rolls the end into the next day for a shift crossing midnight", () => {
    const { start, end } = resolveShiftWindow(nightShift, "2026-08-10");
    expect(start.toISOString()).toBe("2026-08-10T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-08-11T06:00:00.000Z");
  });
});

describe("computeLateMinutes", () => {
  it("returns 0 when no shift is assigned", () => {
    expect(computeLateMinutes(null, "2026-08-10", new Date("2026-08-10T09:30:00Z"))).toBe(0);
  });

  it("returns 0 when clocking in within the grace period", () => {
    expect(computeLateMinutes(dayShift, "2026-08-10", new Date("2026-08-10T09:09:00Z"))).toBe(0);
  });

  it("returns 0 exactly at the grace boundary", () => {
    expect(computeLateMinutes(dayShift, "2026-08-10", new Date("2026-08-10T09:10:00Z"))).toBe(0);
  });

  it("returns minutes late beyond the grace period", () => {
    expect(computeLateMinutes(dayShift, "2026-08-10", new Date("2026-08-10T09:25:00Z"))).toBe(15);
  });

  it("computes lateness correctly for a night shift", () => {
    expect(computeLateMinutes(nightShift, "2026-08-10", new Date("2026-08-10T22:20:00Z"))).toBe(20);
  });
});

describe("computeOvertimeMinutes", () => {
  it("returns 0 when no shift is assigned", () => {
    expect(computeOvertimeMinutes(null, "2026-08-10", new Date("2026-08-10T18:00:00Z"))).toBe(0);
  });

  it("returns 0 when clocking out on or before shift end", () => {
    expect(computeOvertimeMinutes(dayShift, "2026-08-10", new Date("2026-08-10T17:00:00Z"))).toBe(0);
  });

  it("returns minutes worked past shift end", () => {
    expect(computeOvertimeMinutes(dayShift, "2026-08-10", new Date("2026-08-10T17:45:00Z"))).toBe(45);
  });

  it("computes overtime correctly across a night shift's midnight rollover", () => {
    expect(computeOvertimeMinutes(nightShift, "2026-08-10", new Date("2026-08-11T06:30:00Z"))).toBe(30);
  });
});
