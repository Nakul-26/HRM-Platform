import { and, desc, eq } from "drizzle-orm";
import { schema, type Database } from "@hrm/db";
import type { HireCandidateInput } from "@hrm/types";

const { candidates, jobOpenings, offers, employees } = schema;

/**
 * `employeeCode` has no auto-generation helper anywhere in this repo
 * (apps/employee-service's own create route requires the caller to supply
 * it too) — the hire form asks HR for one, same UX as adding an employee
 * directly.
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string } {
  const trimmed = fullName.trim().replace(/\s+/g, " ");
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) return { firstName: trimmed, lastName: "" };
  return { firstName: trimmed.slice(0, firstSpace), lastName: trimmed.slice(firstSpace + 1) };
}

/**
 * Converts a candidate directly into an `employees` row — no HTTP call to
 * employee-service, since every service shares one Postgres database via
 * @hrm/db (the same pattern apps/payroll-service uses to read Leave's
 * tables). Must run inside the caller's `withTenant` transaction so the
 * employee insert and the candidate's `hired` update commit or roll back
 * together.
 *
 * Idempotent: if `candidate.hiredEmployeeId` is already set, this is a
 * no-op that returns the existing employee id instead of erroring or
 * creating a duplicate — hiring the same candidate twice (e.g. a retried
 * request) must be safe.
 */
export async function hireCandidate(
  tx: Database,
  tenantId: string,
  candidate: typeof candidates.$inferSelect,
  input: HireCandidateInput,
): Promise<{ employeeId: string; alreadyHired: boolean }> {
  if (candidate.hiredEmployeeId) {
    return { employeeId: candidate.hiredEmployeeId, alreadyHired: true };
  }

  const [jobOpening] = await tx.select().from(jobOpenings).where(eq(jobOpenings.id, candidate.jobOpeningId));
  if (!jobOpening) throw new Error("Job opening not found for candidate");

  const [acceptedOffer] = await tx
    .select()
    .from(offers)
    .where(and(eq(offers.candidateId, candidate.id), eq(offers.status, "accepted")))
    .orderBy(desc(offers.createdAt))
    .limit(1);

  const dateOfJoining = input.dateOfJoining ?? acceptedOffer?.joiningDate;
  if (!dateOfJoining) {
    throw new Error("dateOfJoining is required — no accepted offer with a joining date exists for this candidate");
  }

  const { firstName, lastName } = splitFullName(candidate.fullName);

  const [employee] = await tx
    .insert(employees)
    .values({
      tenantId,
      employeeCode: input.employeeCode,
      firstName,
      lastName,
      personalEmail: candidate.email,
      employmentType: jobOpening.employmentType,
      dateOfJoining,
      departmentId: input.departmentId ?? jobOpening.departmentId ?? undefined,
      designationId: input.designationId ?? acceptedOffer?.designationId ?? undefined,
      branchId: input.branchId,
      managerId: input.managerId,
      status: "active",
    })
    .returning();
  if (!employee) throw new Error("Failed to create employee record");

  await tx
    .update(candidates)
    .set({ pipelineStage: "hired", hiredEmployeeId: employee.id })
    .where(eq(candidates.id, candidate.id));

  return { employeeId: employee.id, alreadyHired: false };
}
