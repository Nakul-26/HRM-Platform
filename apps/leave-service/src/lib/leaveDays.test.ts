import { describe, expect, it } from "vitest";
import { calculateLeaveDays } from "./leaveDays";

describe("calculateLeaveDays", () => {
  it("counts a single weekday as 1 day", () => {
    expect(calculateLeaveDays("2026-01-05", "2026-01-05")).toBe(1); // Monday
  });

  it("excludes weekends entirely", () => {
    expect(calculateLeaveDays("2026-01-03", "2026-01-04")).toBe(0); // Sat-Sun
  });

  it("counts a full Mon-Fri work week as 5 days", () => {
    expect(calculateLeaveDays("2026-01-05", "2026-01-09")).toBe(5);
  });

  it("excludes a holiday that falls inside the range", () => {
    expect(calculateLeaveDays("2026-01-05", "2026-01-09", [{ date: "2026-01-07" }])).toBe(4);
  });

  it("ignores a holiday outside the range", () => {
    expect(calculateLeaveDays("2026-01-05", "2026-01-09", [{ date: "2026-02-01" }])).toBe(5);
  });

  it("returns 0 when endDate is before startDate", () => {
    expect(calculateLeaveDays("2026-01-10", "2026-01-05")).toBe(0);
  });

  it("returns 0 for invalid date strings", () => {
    expect(calculateLeaveDays("not-a-date", "2026-01-05")).toBe(0);
  });

  it("spans a full weekend-inclusive range correctly (two work weeks)", () => {
    // Mon Jan 5 .. Fri Jan 16 = 10 weekdays across two weeks + one weekend
    expect(calculateLeaveDays("2026-01-05", "2026-01-16")).toBe(10);
  });
});
