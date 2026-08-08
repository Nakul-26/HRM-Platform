import { describe, expect, it } from "vitest";
import { currentPeriodKey } from "./accrual";

describe("currentPeriodKey", () => {
  it("formats a monthly rule as YYYY-MM", () => {
    expect(currentPeriodKey({ per: "month", days: 1.5 }, new Date("2026-08-07T12:00:00Z"))).toBe("2026-08");
  });

  it("pads single-digit months", () => {
    expect(currentPeriodKey({ per: "month", days: 1 }, new Date("2026-01-15T00:00:00Z"))).toBe("2026-01");
  });

  it("formats a yearly rule as YYYY", () => {
    expect(currentPeriodKey({ per: "year", days: 18 }, new Date("2026-08-07T12:00:00Z"))).toBe("2026");
  });

  it("differs across a month boundary, so re-running in the next month is not a no-op", () => {
    const aug = currentPeriodKey({ per: "month", days: 1.5 }, new Date("2026-08-31T23:00:00Z"));
    const sep = currentPeriodKey({ per: "month", days: 1.5 }, new Date("2026-09-01T01:00:00Z"));
    expect(aug).not.toBe(sep);
  });

  it("is identical for two calls within the same month, so a same-month re-run is a no-op", () => {
    const first = currentPeriodKey({ per: "month", days: 1.5 }, new Date("2026-08-01T00:00:00Z"));
    const second = currentPeriodKey({ per: "month", days: 1.5 }, new Date("2026-08-28T23:59:00Z"));
    expect(first).toBe(second);
  });
});
