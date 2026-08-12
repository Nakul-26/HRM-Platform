import { z } from "zod";

export const reviewCycleStatusSchema = z.enum(["open", "closed"]);
export type ReviewCycleStatus = z.infer<typeof reviewCycleStatusSchema>;

export const reviewCycleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(200),
  startDate: z.string(),
  endDate: z.string(),
  status: reviewCycleStatusSchema,
});
export type ReviewCycle = z.infer<typeof reviewCycleSchema>;

export const createReviewCycleSchema = z
  .object({
    name: z.string().min(1).max(200),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  })
  .refine((v) => v.endDate >= v.startDate, { message: "endDate must be on or after startDate", path: ["endDate"] });
export type CreateReviewCycleInput = z.infer<typeof createReviewCycleSchema>;

export const goalSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  reviewCycleId: z.string().uuid().nullable(),
  title: z.string().min(1).max(300),
  weight: z.number().int().min(0).max(100).nullable(),
  progress: z.number().int().min(0).max(100),
});
export type Goal = z.infer<typeof goalSchema>;

export const createGoalSchema = z.object({
  employeeId: z.string().uuid(),
  reviewCycleId: z.string().uuid().optional(),
  title: z.string().min(1).max(300),
  weight: z.number().int().min(0).max(100).optional(),
});
export type CreateGoalInput = z.infer<typeof createGoalSchema>;

export const updateGoalSchema = z.object({
  title: z.string().min(1).max(300).optional(),
  weight: z.number().int().min(0).max(100).optional(),
  progress: z.number().int().min(0).max(100).optional(),
});
export type UpdateGoalInput = z.infer<typeof updateGoalSchema>;

export const reviewStatusSchema = z.enum(["draft", "submitted"]);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

export const reviewSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  reviewCycleId: z.string().uuid(),
  employeeId: z.string().uuid(),
  reviewerId: z.string().uuid(),
  rating: z.number().min(0).max(5).nullable(),
  comments: z.string().nullable(),
  status: reviewStatusSchema,
});
export type Review = z.infer<typeof reviewSchema>;

export const createReviewSchema = z.object({
  reviewCycleId: z.string().uuid(),
  employeeId: z.string().uuid(),
  rating: z.number().min(0).max(5).optional(),
  comments: z.string().max(4000).optional(),
});
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

// Only permitted while status is still "draft" — submitting is a separate,
// one-way action (PATCH /reviews/:id/submit).
export const updateReviewSchema = z.object({
  rating: z.number().min(0).max(5).optional(),
  comments: z.string().max(4000).optional(),
});
export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;

export const promotionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  reviewId: z.string().uuid(),
  previousDesignationId: z.string().uuid().nullable(),
  newDesignationId: z.string().uuid(),
  effectiveDate: z.string(),
  notes: z.string().nullable(),
});
export type Promotion = z.infer<typeof promotionSchema>;

export const createPromotionSchema = z.object({
  employeeId: z.string().uuid(),
  reviewId: z.string().uuid(),
  newDesignationId: z.string().uuid(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  notes: z.string().max(2000).optional(),
});
export type CreatePromotionInput = z.infer<typeof createPromotionSchema>;

export const reviewableEmployeeSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
});
export type ReviewableEmployee = z.infer<typeof reviewableEmployeeSchema>;
