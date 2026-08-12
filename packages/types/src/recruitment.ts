import { z } from "zod";

export const jobOpeningStatusSchema = z.enum(["open", "closed", "on_hold"]);
export type JobOpeningStatus = z.infer<typeof jobOpeningStatusSchema>;

// Same enum as employee.ts's employmentTypeSchema — kept in sync deliberately,
// since this value flows straight onto the hired candidate's employee record.
export const jobOpeningEmploymentTypeSchema = z.enum(["full_time", "part_time", "contract", "intern"]);
export type JobOpeningEmploymentType = z.infer<typeof jobOpeningEmploymentTypeSchema>;

export const jobOpeningSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  title: z.string().min(1).max(200),
  departmentId: z.string().uuid().nullable(),
  employmentType: jobOpeningEmploymentTypeSchema,
  status: jobOpeningStatusSchema,
});
export type JobOpening = z.infer<typeof jobOpeningSchema>;

export const createJobOpeningSchema = z.object({
  title: z.string().min(1).max(200),
  departmentId: z.string().uuid().optional(),
  employmentType: jobOpeningEmploymentTypeSchema.optional(),
});
export type CreateJobOpeningInput = z.infer<typeof createJobOpeningSchema>;
export const updateJobOpeningSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  departmentId: z.string().uuid().optional(),
  employmentType: jobOpeningEmploymentTypeSchema.optional(),
  status: jobOpeningStatusSchema.optional(),
});
export type UpdateJobOpeningInput = z.infer<typeof updateJobOpeningSchema>;

export const pipelineStageSchema = z.enum(["applied", "screening", "interview", "offer", "hired", "rejected"]);
export type PipelineStage = z.infer<typeof pipelineStageSchema>;

export const candidateSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  jobOpeningId: z.string().uuid(),
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
  resumeR2Key: z.string().nullable(),
  pipelineStage: pipelineStageSchema,
  hiredEmployeeId: z.string().uuid().nullable(),
});
export type Candidate = z.infer<typeof candidateSchema>;

export const createCandidateSchema = z.object({
  jobOpeningId: z.string().uuid(),
  fullName: z.string().min(1).max(200),
  email: z.string().email(),
});
export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;

// pipelineStage is deliberately excluded here: "hired" can only be reached via
// POST /candidates/:id/hire, never a plain field update (apps/recruitment-service).
export const updateCandidateSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  pipelineStage: z.enum(["applied", "screening", "interview", "offer", "rejected"]).optional(),
});
export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;

export const hireCandidateSchema = z.object({
  employeeCode: z.string().min(1).max(50),
  dateOfJoining: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .optional(),
  departmentId: z.string().uuid().optional(),
  designationId: z.string().uuid().optional(),
  branchId: z.string().uuid().optional(),
  managerId: z.string().uuid().optional(),
});
export type HireCandidateInput = z.infer<typeof hireCandidateSchema>;

export const interviewStatusSchema = z.enum(["scheduled", "completed", "cancelled"]);
export type InterviewStatus = z.infer<typeof interviewStatusSchema>;

export const interviewSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  candidateId: z.string().uuid(),
  interviewerId: z.string().uuid().nullable(),
  scheduledAt: z.string(),
  status: interviewStatusSchema,
  feedback: z.string().nullable(),
  rating: z.number().int().min(1).max(5).nullable(),
});
export type Interview = z.infer<typeof interviewSchema>;

export const createInterviewSchema = z.object({
  candidateId: z.string().uuid(),
  interviewerId: z.string().uuid(),
  scheduledAt: z.string(),
});
export type CreateInterviewInput = z.infer<typeof createInterviewSchema>;

export const updateInterviewSchema = z.object({
  interviewerId: z.string().uuid().optional(),
  scheduledAt: z.string().optional(),
  status: z.enum(["scheduled", "cancelled"]).optional(),
});
export type UpdateInterviewInput = z.infer<typeof updateInterviewSchema>;

export const submitInterviewFeedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  feedback: z.string().min(1).max(4000),
});
export type SubmitInterviewFeedbackInput = z.infer<typeof submitInterviewFeedbackSchema>;

export const offerStatusSchema = z.enum(["pending", "accepted", "declined", "withdrawn"]);
export type OfferStatus = z.infer<typeof offerStatusSchema>;

export const offerSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  candidateId: z.string().uuid(),
  designationId: z.string().uuid().nullable(),
  offeredCtc: z.number(),
  joiningDate: z.string(),
  status: offerStatusSchema,
});
export type Offer = z.infer<typeof offerSchema>;

export const createOfferSchema = z.object({
  candidateId: z.string().uuid(),
  designationId: z.string().uuid().optional(),
  offeredCtc: z.number().positive(),
  joiningDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
});
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

export const updateOfferStatusSchema = z.object({
  status: z.enum(["accepted", "declined", "withdrawn"]),
});
export type UpdateOfferStatusInput = z.infer<typeof updateOfferStatusSchema>;
