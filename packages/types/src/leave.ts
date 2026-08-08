import { z } from "zod";

/** `days` matches the numeric column comment in packages/db/src/schema/leave.ts (`{ "per": "month", "days": 1.5 }`). */
export const leaveAccrualRuleSchema = z.object({
  per: z.enum(["month", "year"]),
  days: z.number().positive(),
});
export type LeaveAccrualRule = z.infer<typeof leaveAccrualRuleSchema>;

export const leaveTypeSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(200),
  isPaid: z.boolean(),
  accrualRule: leaveAccrualRuleSchema.nullable(),
});
export type LeaveType = z.infer<typeof leaveTypeSchema>;

export const createLeaveTypeSchema = leaveTypeSchema.pick({ name: true }).extend({
  isPaid: z.boolean().optional(),
  accrualRule: leaveAccrualRuleSchema.optional(),
});
export type CreateLeaveTypeInput = z.infer<typeof createLeaveTypeSchema>;
export const updateLeaveTypeSchema = createLeaveTypeSchema.partial();
export type UpdateLeaveTypeInput = z.infer<typeof updateLeaveTypeSchema>;

export const holidaySchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  branchId: z.string().uuid().nullable(), // null = applies to all branches
  name: z.string().min(1).max(200),
  date: z.string(), // ISO date (YYYY-MM-DD), stored as a Postgres `date` column
});
export type Holiday = z.infer<typeof holidaySchema>;

export const createHolidaySchema = holidaySchema.pick({ name: true, date: true }).extend({
  branchId: z.string().uuid().optional(),
});
export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;

export const leaveRequestStatusSchema = z.enum(["pending", "approved", "rejected", "cancelled"]);
export type LeaveRequestStatus = z.infer<typeof leaveRequestStatusSchema>;

export const leaveRequestSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  startDate: z.string(),
  endDate: z.string(),
  days: z.number(), // Postgres `numeric` column — routes convert the driver's string return to a number before responding.
  reason: z.string().nullable(),
  status: leaveRequestStatusSchema,
  approverId: z.string().uuid().nullable(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
});
export type LeaveRequest = z.infer<typeof leaveRequestSchema>;

/** `days` is never accepted from the client — the service recomputes it server-side via calculateLeaveDays(). */
export const applyLeaveSchema = z.object({
  leaveTypeId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  reason: z.string().max(1000).optional(),
});
export type ApplyLeaveInput = z.infer<typeof applyLeaveSchema>;

/** Body for both approve and reject — `reason` is optional context, mainly meaningful on reject. */
export const leaveDecisionSchema = z.object({
  reason: z.string().max(1000).optional(),
});
export type LeaveDecisionInput = z.infer<typeof leaveDecisionSchema>;

export const leaveBalanceSchema = z.object({
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  leaveTypeId: z.string().uuid(),
  year: z.number().int(),
  entitled: z.number(),
  used: z.number(),
  carriedForward: z.number(),
  lastAccrualPeriod: z.string().nullable(),
});
export type LeaveBalance = z.infer<typeof leaveBalanceSchema>;

export interface LeaveAccrualRunResult {
  tenantsProcessed: number;
  balancesUpdated: number;
}
