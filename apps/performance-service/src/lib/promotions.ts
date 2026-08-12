import { eq } from "drizzle-orm";
import { schema, type Database } from "@hrm/db";
import type { CreatePromotionInput } from "@hrm/types";

const { employees, promotions, reviews } = schema;

export type ApplyPromotionResult =
  | { kind: "review_not_found" }
  | { kind: "review_mismatch" }
  | { kind: "employee_not_found" }
  | { kind: "applied"; promotion: typeof promotions.$inferSelect };

/**
 * The resolved promotion-workflow decision (docs discussion, Phase 4 plan):
 * HR records a promotion tied to a specific review, which updates the
 * employee's designation directly — no separate propose/approve state
 * machine. Runs inside the caller's transaction so a promotion record can
 * never exist without the designation actually having changed.
 */
export async function applyPromotion(tx: Database, tenantId: string, input: CreatePromotionInput): Promise<ApplyPromotionResult> {
  const [review] = await tx.select().from(reviews).where(eq(reviews.id, input.reviewId));
  if (!review) return { kind: "review_not_found" };
  if (review.employeeId !== input.employeeId) return { kind: "review_mismatch" };

  const [employee] = await tx.select().from(employees).where(eq(employees.id, input.employeeId));
  if (!employee) return { kind: "employee_not_found" };

  const [promotion] = await tx
    .insert(promotions)
    .values({
      tenantId,
      employeeId: input.employeeId,
      reviewId: input.reviewId,
      previousDesignationId: employee.designationId,
      newDesignationId: input.newDesignationId,
      effectiveDate: input.effectiveDate,
      notes: input.notes,
    })
    .returning();
  if (!promotion) throw new Error("Failed to record promotion");

  await tx.update(employees).set({ designationId: input.newDesignationId, updatedAt: new Date() }).where(eq(employees.id, input.employeeId));

  return { kind: "applied", promotion };
}
