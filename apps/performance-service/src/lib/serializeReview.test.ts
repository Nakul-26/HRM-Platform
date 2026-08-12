import { describe, expect, it } from "vitest";
import { serializeReview } from "./serializeReview";

function baseRow(overrides: Partial<{ rating: string | null }> = {}) {
  return {
    id: "review-1",
    tenantId: "tenant-1",
    reviewCycleId: "cycle-1",
    employeeId: "emp-1",
    reviewerId: "emp-2",
    comments: null,
    status: "draft",
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    rating: null,
    ...overrides,
  };
}

describe("serializeReview", () => {
  it("converts a numeric-string rating to a number", () => {
    expect(serializeReview(baseRow({ rating: "4.5" })).rating).toBe(4.5);
  });

  it("passes through a null rating unchanged", () => {
    expect(serializeReview(baseRow({ rating: null })).rating).toBeNull();
  });
});
