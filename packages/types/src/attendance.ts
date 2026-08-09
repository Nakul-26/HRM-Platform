import { z } from "zod";

const isoTime = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "must be HH:MM or HH:MM:SS");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD");

export const shiftTemplateSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(200),
  startTime: isoTime,
  endTime: isoTime,
  isNightShift: z.boolean(),
  graceMinutes: z.number().int().min(0),
});
export type ShiftTemplate = z.infer<typeof shiftTemplateSchema>;

export const createShiftTemplateSchema = shiftTemplateSchema
  .pick({ name: true, startTime: true, endTime: true })
  .extend({
    isNightShift: z.boolean().optional(),
    graceMinutes: z.number().int().min(0).optional(),
  });
export type CreateShiftTemplateInput = z.infer<typeof createShiftTemplateSchema>;
export const updateShiftTemplateSchema = createShiftTemplateSchema.partial();
export type UpdateShiftTemplateInput = z.infer<typeof updateShiftTemplateSchema>;

export const shiftAssignmentSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  shiftTemplateId: z.string().uuid(),
  effectiveFrom: isoDate,
  effectiveTo: isoDate.nullable(),
});
export type ShiftAssignment = z.infer<typeof shiftAssignmentSchema>;

export const createShiftAssignmentSchema = shiftAssignmentSchema
  .pick({ employeeId: true, shiftTemplateId: true, effectiveFrom: true })
  .extend({ effectiveTo: isoDate.optional() });
export type CreateShiftAssignmentInput = z.infer<typeof createShiftAssignmentSchema>;

export const attendanceStatusSchema = z.enum(["present", "absent", "half_day", "on_leave", "holiday"]);
export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const attendanceRecordSchema = z.object({
  id: z.string(), // bigserial — driver returns strings; kept as string on the wire.
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  workDate: isoDate,
  clockIn: z.string().nullable(),
  clockOut: z.string().nullable(),
  source: z.enum(["biometric", "manual", "mobile", "web"]),
  status: attendanceStatusSchema,
  lateMinutes: z.number().int(),
  overtimeMinutes: z.number().int(),
  isCorrected: z.boolean(),
});
export type AttendanceRecord = z.infer<typeof attendanceRecordSchema>;

/** Body accepted by clock-in/out — `source` defaults to "web" (self-service portal). */
export const clockInSchema = z.object({
  source: z.enum(["manual", "mobile", "web"]).optional(),
});
export type ClockInInput = z.infer<typeof clockInSchema>;
export const clockOutSchema = clockInSchema;
export type ClockOutInput = z.infer<typeof clockOutSchema>;

export const attendanceCorrectionStatusSchema = z.enum(["pending", "approved", "rejected", "cancelled"]);
export type AttendanceCorrectionStatus = z.infer<typeof attendanceCorrectionStatusSchema>;

export const attendanceCorrectionSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  employeeId: z.string().uuid(),
  workDate: isoDate,
  requestedClockIn: z.string().nullable(),
  requestedClockOut: z.string().nullable(),
  requestedStatus: attendanceStatusSchema.nullable(),
  reason: z.string().nullable(),
  status: attendanceCorrectionStatusSchema,
  approverId: z.string().uuid().nullable(),
  decisionNote: z.string().nullable(),
  decidedAt: z.string().nullable(),
});
export type AttendanceCorrection = z.infer<typeof attendanceCorrectionSchema>;

/** At least one requested field must be present — enforced in the route, not expressible cleanly in Zod's object shape alone. */
export const applyCorrectionSchema = z
  .object({
    workDate: isoDate,
    requestedClockIn: z.string().datetime().optional(),
    requestedClockOut: z.string().datetime().optional(),
    requestedStatus: attendanceStatusSchema.optional(),
    reason: z.string().max(1000).optional(),
  })
  .refine((v) => v.requestedClockIn || v.requestedClockOut || v.requestedStatus, {
    message: "At least one of requestedClockIn, requestedClockOut, or requestedStatus is required",
  });
export type ApplyCorrectionInput = z.infer<typeof applyCorrectionSchema>;

/** Body for both approve and reject — `reason` is optional context, mainly meaningful on reject. */
export const correctionDecisionSchema = z.object({
  reason: z.string().max(1000).optional(),
});
export type CorrectionDecisionInput = z.infer<typeof correctionDecisionSchema>;
