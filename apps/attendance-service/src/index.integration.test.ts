import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { loadEnv, baseEnvSchema } from "@hrm/config";
import { createDbClient, createTenant, schema, type Database } from "@hrm/db";
import { signAccessToken } from "@hrm/auth";
import { PERMISSIONS, type AuthContext, type Permission } from "@hrm/types";
import { app } from "./index";

/**
 * Exercises the full HTTP surface of the attendance-service against a real
 * Postgres (RLS included), not mocks — same pattern as
 * apps/leave-service/src/index.integration.test.ts. AuthContext is
 * synthesized directly with `signAccessToken` since every downstream
 * service trusts a pre-resolved, signed context from the Gateway
 * (docs/architecture/06-security.md).
 */
describe("attendance-service", () => {
  const env = loadEnv(baseEnvSchema);
  const testEnv = { APP_DATABASE_URL: env.APP_DATABASE_URL, JWT_SIGNING_KEY: env.JWT_SIGNING_KEY, JWT_KID: env.JWT_KID };

  let adminDb: Database;
  let tenantA: { id: string };
  let tenantB: { id: string };

  let adminEmployeeA: { id: string };
  let managerEmployeeA: { id: string };
  let reportEmployeeA: { id: string };
  let otherEmployeeA: { id: string };
  let employeeB: { id: string };

  let clockEmployeeA: { id: string };
  let clockEmployeeB: { id: string };
  let clockEmployeeC: { id: string };
  let clockEmployeeD: { id: string };

  let shiftA: { id: string };

  function iso(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  /** Minutes elapsed since UTC midnight today — used to assert late/overtime math against a "00:00" shift without any wall-clock flakiness. */
  function minutesSinceUtcMidnight(d: Date): number {
    const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return Math.floor((d.getTime() - midnight) / 60_000);
  }

  let workDateCounter = 0;
  /** A unique, deterministic past date per call — well clear of "today" (used by clock-in/out) and of every other test's date. */
  function nextWorkDate(): string {
    workDateCounter += 1;
    return iso(new Date(Date.UTC(2020, 0, 1 + workDateCounter)));
  }

  function authFor(overrides: Partial<AuthContext>): AuthContext {
    return {
      tenantId: tenantA.id,
      userId: crypto.randomUUID(),
      employeeId: null,
      roleId: crypto.randomUUID(),
      roleName: "custom",
      permissions: [],
      ...overrides,
    };
  }

  async function bearer(auth: AuthContext): Promise<string> {
    return `Bearer ${await signAccessToken(auth, { signingKey: env.JWT_SIGNING_KEY, kid: env.JWT_KID })}`;
  }

  async function req(method: string, path: string, auth: AuthContext | null, body?: unknown) {
    const headers: Record<string, string> = {};
    if (auth) headers.authorization = await bearer(auth);
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    return app.request(path, init, testEnv);
  }

  const ALL_PERMISSIONS = [...PERMISSIONS] as Permission[];

  beforeAll(async () => {
    adminDb = createDbClient(env.DATABASE_URL);
    const suffix = Math.random().toString(36).slice(2, 8);

    tenantA = await createTenant(adminDb, {
      slug: `att-svc-a-${suffix}`,
      name: "Attendance Service Test Tenant A",
      adminEmail: `admin-a-${suffix}@test.local`,
      adminName: "Admin A",
      adminPassword: "Test-Password-123",
    });
    tenantB = await createTenant(adminDb, {
      slug: `att-svc-b-${suffix}`,
      name: "Attendance Service Test Tenant B",
      adminEmail: `admin-b-${suffix}@test.local`,
      adminName: "Admin B",
      adminPassword: "Test-Password-123",
    });

    const [admin] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "A-ADMIN", firstName: "Ada", lastName: "Admin", employmentType: "full_time", dateOfJoining: "2020-01-01", status: "active" })
      .returning();
    const [manager] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "A-MGR", firstName: "Mona", lastName: "Manager", employmentType: "full_time", dateOfJoining: "2020-01-01", status: "active" })
      .returning();
    const [report] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "A-REPORT", firstName: "Rita", lastName: "Report", managerId: manager!.id, employmentType: "full_time", dateOfJoining: "2021-06-01", status: "active" })
      .returning();
    const [other] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "A-OTHER", firstName: "Oscar", lastName: "Other", employmentType: "full_time", dateOfJoining: "2021-06-01", status: "active" })
      .returning();
    const [b1] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantB.id, employeeCode: "A-B-ONE", firstName: "Beatrice", lastName: "One", employmentType: "full_time", dateOfJoining: "2021-06-01", status: "active" })
      .returning();
    const [clockA] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "A-CLOCK-A", firstName: "Clara", lastName: "ClockA", employmentType: "full_time", dateOfJoining: "2021-06-01", status: "active" })
      .returning();
    const [clockB] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "A-CLOCK-B", firstName: "Clive", lastName: "ClockB", employmentType: "full_time", dateOfJoining: "2021-06-01", status: "active" })
      .returning();
    const [clockC] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "A-CLOCK-C", firstName: "Cleo", lastName: "ClockC", employmentType: "full_time", dateOfJoining: "2021-06-01", status: "active" })
      .returning();
    const [clockD] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "A-CLOCK-D", firstName: "Dana", lastName: "ClockD", employmentType: "full_time", dateOfJoining: "2021-06-01", status: "active" })
      .returning();

    adminEmployeeA = admin!;
    managerEmployeeA = manager!;
    reportEmployeeA = report!;
    otherEmployeeA = other!;
    employeeB = b1!;
    clockEmployeeA = clockA!;
    clockEmployeeB = clockB!;
    clockEmployeeC = clockC!;
    clockEmployeeD = clockD!;

    const [shift] = await adminDb
      .insert(schema.shiftTemplates)
      .values({ tenantId: tenantA.id, name: "Midnight Test Shift", startTime: "00:00", endTime: "00:01", graceMinutes: 0 })
      .returning();
    shiftA = shift!;

    await adminDb.insert(schema.employeeShiftAssignments).values({
      tenantId: tenantA.id,
      employeeId: clockEmployeeB.id,
      shiftTemplateId: shiftA.id,
      effectiveFrom: "2020-01-01",
    });
  });

  afterAll(async () => {
    const tenantIds = [tenantA.id, tenantB.id];
    await adminDb.delete(schema.attendanceCorrections).where(inArray(schema.attendanceCorrections.tenantId, tenantIds));
    await adminDb.delete(schema.attendanceRecords).where(inArray(schema.attendanceRecords.tenantId, tenantIds));
    await adminDb.delete(schema.employeeShiftAssignments).where(inArray(schema.employeeShiftAssignments.tenantId, tenantIds));
    await adminDb.delete(schema.shiftTemplates).where(inArray(schema.shiftTemplates.tenantId, tenantIds));
    await adminDb.delete(schema.employees).where(inArray(schema.employees.tenantId, tenantIds));
    await adminDb.delete(schema.accounts).where(inArray(schema.accounts.tenantId, tenantIds));
    await adminDb.delete(schema.users).where(inArray(schema.users.tenantId, tenantIds));
    await adminDb.delete(schema.rolePermissions).where(
      inArray(
        schema.rolePermissions.roleId,
        adminDb.select({ id: schema.roles.id }).from(schema.roles).where(inArray(schema.roles.tenantId, tenantIds)),
      ),
    );
    await adminDb.delete(schema.roles).where(inArray(schema.roles.tenantId, tenantIds));
    await adminDb.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
  });

  describe("shift templates", () => {
    it("requires attendance.shift.manage to create, and rejects everyone else", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["attendance.shift.manage"] });
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: ["attendance.clock"] });

      const created = await req("POST", "/api/v1/attendance/shifts", admin, { name: "Evening Shift", startTime: "14:00", endTime: "22:00" });
      expect(created.status).toBe(201);

      const rejected = await req("POST", "/api/v1/attendance/shifts", noPerm, { name: "Made Up Shift", startTime: "09:00", endTime: "17:00" });
      expect(rejected.status).toBe(403);
    });

    it("is listable by any authenticated user without attendance.shift.manage", async () => {
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: [] });
      const res = await req("GET", "/api/v1/attendance/shifts?pageSize=100", noPerm);
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as { data: { name: string }[] };
      expect(data.some((s) => s.name === "Midnight Test Shift")).toBe(true);
    });
  });

  describe("shift assignments", () => {
    it("requires attendance.shift.manage to create or list all, but self can always view /me", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["attendance.shift.manage"] });
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: [] });

      const created = await req("POST", "/api/v1/attendance/shift-assignments", admin, {
        employeeId: otherEmployeeA.id,
        shiftTemplateId: shiftA.id,
        effectiveFrom: "2020-01-01",
      });
      expect(created.status).toBe(201);

      const rejectedCreate = await req("POST", "/api/v1/attendance/shift-assignments", noPerm, {
        employeeId: otherEmployeeA.id,
        shiftTemplateId: shiftA.id,
        effectiveFrom: "2020-01-01",
      });
      expect(rejectedCreate.status).toBe(403);

      const rejectedList = await req("GET", "/api/v1/attendance/shift-assignments", noPerm);
      expect(rejectedList.status).toBe(403);

      const self = authFor({ employeeId: clockEmployeeB.id, permissions: [] });
      const me = await req("GET", "/api/v1/attendance/shift-assignments/me", self);
      expect(me.status).toBe(200);
      const meBody = (await me.json()) as { data: { shiftTemplate: { id: string } | null } };
      expect(meBody.data.shiftTemplate?.id).toBe(shiftA.id);
    });
  });

  describe("clock in/out", () => {
    it("requires attendance.clock and a linked employeeId", async () => {
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: [] });
      const res = await req("POST", "/api/v1/attendance/records/clock-in", noPerm);
      expect(res.status).toBe(403);
    });

    it("clocks in successfully and computes late minutes against an assigned shift", async () => {
      const self = authFor({ employeeId: clockEmployeeB.id, permissions: ["attendance.clock"] });
      const before = new Date();

      const res = await req("POST", "/api/v1/attendance/records/clock-in", self);
      expect(res.status).toBe(201);
      const { data } = (await res.json()) as { data: { status: string; clockIn: string; lateMinutes: number } };
      expect(data.status).toBe("present");
      expect(data.clockIn).not.toBeNull();
      expect(Math.abs(data.lateMinutes - minutesSinceUtcMidnight(before))).toBeLessThanOrEqual(1);
    });

    it("rejects a second clock-in the same day", async () => {
      const self = authFor({ employeeId: clockEmployeeB.id, permissions: ["attendance.clock"] });
      const res = await req("POST", "/api/v1/attendance/records/clock-in", self);
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("ALREADY_CLOCKED_IN");
    });

    it("rejects clock-out without a prior clock-in", async () => {
      const self = authFor({ employeeId: clockEmployeeC.id, permissions: ["attendance.clock"] });
      const res = await req("POST", "/api/v1/attendance/records/clock-out", self);
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("NOT_CLOCKED_IN");
    });

    it("clocks out successfully and computes overtime minutes against an assigned shift", async () => {
      const self = authFor({ employeeId: clockEmployeeB.id, permissions: ["attendance.clock"] });
      const before = new Date();

      const res = await req("POST", "/api/v1/attendance/records/clock-out", self);
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as { data: { clockOut: string; overtimeMinutes: number } };
      expect(data.clockOut).not.toBeNull();
      // Shift ends at 00:01 — virtually the whole day counts as overtime.
      expect(Math.abs(data.overtimeMinutes - minutesSinceUtcMidnight(before))).toBeLessThanOrEqual(1);

      const again = await req("POST", "/api/v1/attendance/records/clock-out", self);
      expect(again.status).toBe(409);
      const againBody = (await again.json()) as { error: { code: string } };
      expect(againBody.error.code).toBe("ALREADY_CLOCKED_OUT");
    });

    it("under truly concurrent clock-ins for the same employee/day, exactly one succeeds and the rest 409 cleanly (none 500)", async () => {
      // A select-then-branch implementation would let two concurrent
      // requests both pass the "no existing record" check before either
      // commits, then race on the unique (tenant,employee,workDate)
      // constraint — the loser crashing with a 500 instead of a clean 409.
      // The route uses an atomic insert-with-conflict-guard instead; this
      // fires real concurrent requests (not sequential awaits) to prove it.
      const self = authFor({ employeeId: clockEmployeeD.id, permissions: ["attendance.clock"] });
      const responses = await Promise.all(
        Array.from({ length: 8 }, () => req("POST", "/api/v1/attendance/records/clock-in", self)),
      );
      const statuses = responses.map((r) => r.status).sort();
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(7);
      expect(statuses.filter((s) => s !== 201 && s !== 409)).toHaveLength(0);
    });

    it("clocks in with no shift assigned and reports zero late minutes", async () => {
      const self = authFor({ employeeId: clockEmployeeA.id, permissions: ["attendance.clock"] });
      const res = await req("POST", "/api/v1/attendance/records/clock-in", self);
      expect(res.status).toBe(201);
      const { data } = (await res.json()) as { data: { lateMinutes: number } };
      expect(data.lateMinutes).toBe(0);
    });
  });

  describe("corrections: apply", () => {
    it("requires attendance.request_correction and a linked employeeId", async () => {
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: [] });
      const res = await req("POST", "/api/v1/attendance/corrections", noPerm, {
        workDate: nextWorkDate(),
        requestedStatus: "absent",
      });
      expect(res.status).toBe(403);
    });

    it("rejects a payload with no requested fields at all", async () => {
      const applicant = authFor({ employeeId: otherEmployeeA.id, permissions: ["attendance.request_correction"] });
      const res = await req("POST", "/api/v1/attendance/corrections", applicant, { workDate: nextWorkDate() });
      expect(res.status).toBe(400);
    });

    it("accepts a valid correction request as pending", async () => {
      const applicant = authFor({ employeeId: otherEmployeeA.id, permissions: ["attendance.request_correction"] });
      const res = await req("POST", "/api/v1/attendance/corrections", applicant, {
        workDate: nextWorkDate(),
        requestedStatus: "absent",
        reason: "Forgot to log",
      });
      expect(res.status).toBe(201);
      const { data } = (await res.json()) as { data: { status: string } };
      expect(data.status).toBe("pending");
    });
  });

  describe("corrections: state machine", () => {
    async function applyForReport() {
      const applicant = authFor({ employeeId: reportEmployeeA.id, permissions: ["attendance.request_correction"] });
      const workDate = nextWorkDate();
      const res = await req("POST", "/api/v1/attendance/corrections", applicant, {
        workDate,
        requestedClockIn: `${workDate}T09:15:00.000Z`,
        requestedStatus: "present",
        reason: "Biometric was down",
      });
      expect(res.status).toBe(201);
      return { workDate, ...((await res.json()) as { data: { id: string } }).data };
    }

    it("lets the owner cancel their own pending request, but not twice", async () => {
      const created = await applyForReport();
      const owner = authFor({ employeeId: reportEmployeeA.id, permissions: [] });

      const cancelled = await req("PATCH", `/api/v1/attendance/corrections/${created.id}/cancel`, owner);
      expect(cancelled.status).toBe(200);

      const secondCancel = await req("PATCH", `/api/v1/attendance/corrections/${created.id}/cancel`, owner);
      expect(secondCancel.status).toBe(409);
    });

    it("forbids a non-owner from cancelling someone else's request", async () => {
      const created = await applyForReport();
      const peer = authFor({ employeeId: otherEmployeeA.id, permissions: [] });

      const res = await req("PATCH", `/api/v1/attendance/corrections/${created.id}/cancel`, peer);
      expect(res.status).toBe(403);
    });

    it("lets the direct manager approve, applying the requested fields to attendanceRecords and marking isCorrected", async () => {
      const created = await applyForReport();
      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["attendance.correct"] });

      const approved = await req("PATCH", `/api/v1/attendance/corrections/${created.id}/approve`, manager);
      expect(approved.status).toBe(200);
      const approvedBody = (await approved.json()) as { data: { status: string } };
      expect(approvedBody.data.status).toBe("approved");

      const matching = await adminDb
        .select()
        .from(schema.attendanceRecords)
        .where(and(eq(schema.attendanceRecords.employeeId, reportEmployeeA.id), eq(schema.attendanceRecords.workDate, created.workDate)));
      expect(matching[0]?.status).toBe("present");
      expect(matching[0]?.isCorrected).toBe(true);
      expect(matching[0]?.clockIn).not.toBeNull();

      const reDecide = await req("PATCH", `/api/v1/attendance/corrections/${created.id}/reject`, manager);
      expect(reDecide.status).toBe(409);
    });

    it("forbids an unrelated peer (no direct-report relationship) from approving", async () => {
      const created = await applyForReport();
      const peer = authFor({ employeeId: otherEmployeeA.id, permissions: ["attendance.correct"] });

      const res = await req("PATCH", `/api/v1/attendance/corrections/${created.id}/approve`, peer);
      expect(res.status).toBe(403);
    });

    it("lets an org-wide approver reject with a decision note", async () => {
      const created = await applyForReport();
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["attendance.correct_all"] });

      const rejected = await req("PATCH", `/api/v1/attendance/corrections/${created.id}/reject`, admin, {
        reason: "Not enough evidence",
      });
      expect(rejected.status).toBe(200);
      const body = (await rejected.json()) as { data: { status: string; decisionNote: string | null } };
      expect(body.data.status).toBe("rejected");
      expect(body.data.decisionNote).toBe("Not enough evidence");
    });
  });

  describe("list scoping", () => {
    it("org-wide approver sees requests across employees; a plain scoped approver sees only self + direct reports", async () => {
      await applyForReportHelper();
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["attendance.correct_all"] });
      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["attendance.correct"] });

      const adminList = await req("GET", "/api/v1/attendance/corrections?pageSize=100", admin);
      const adminIds = ((await adminList.json()) as { data: { employeeId: string }[] }).data.map((r) => r.employeeId);
      expect(adminIds).toContain(reportEmployeeA.id);

      const managerList = await req("GET", "/api/v1/attendance/corrections?pageSize=100", manager);
      const managerIds = ((await managerList.json()) as { data: { employeeId: string }[] }).data.map((r) => r.employeeId);
      expect(managerIds).toContain(reportEmployeeA.id); // direct report
      expect(managerIds).not.toContain(otherEmployeeA.id); // not a report of this manager
    });

    it("a plain applicant with no correct permission sees only their own requests", async () => {
      const self = authFor({ employeeId: otherEmployeeA.id, permissions: ["attendance.request_correction"] });
      const res = await req("GET", "/api/v1/attendance/corrections?pageSize=100", self);
      const ids = ((await res.json()) as { data: { employeeId: string }[] }).data.map((r) => r.employeeId);
      expect(ids.every((id) => id === otherEmployeeA.id)).toBe(true);
    });

    async function applyForReportHelper() {
      const applicant = authFor({ employeeId: reportEmployeeA.id, permissions: ["attendance.request_correction"] });
      await req("POST", "/api/v1/attendance/corrections", applicant, { workDate: nextWorkDate(), requestedStatus: "absent" });
    }
  });

  describe("cross-tenant isolation", () => {
    it("tenant B cannot see or act on tenant A's correction request (RLS, not just app logic)", async () => {
      const applicant = authFor({ employeeId: otherEmployeeA.id, permissions: ["attendance.request_correction"] });
      const res = await req("POST", "/api/v1/attendance/corrections", applicant, { workDate: nextWorkDate(), requestedStatus: "absent" });
      const created = ((await res.json()) as { data: { id: string } }).data;

      const tenantBApprover = authFor({ tenantId: tenantB.id, employeeId: employeeB.id, permissions: ["attendance.correct_all"] });
      const getRes = await req("GET", `/api/v1/attendance/corrections/${created.id}`, tenantBApprover);
      expect(getRes.status).toBe(404);

      const approveRes = await req("PATCH", `/api/v1/attendance/corrections/${created.id}/approve`, tenantBApprover);
      expect(approveRes.status).toBe(404);
    });
  });

  it("sanity: the attendance permission strings used above still exist in the shared catalog", () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining([
        "attendance.clock",
        "attendance.request_correction",
        "attendance.correct",
        "attendance.correct_all",
        "attendance.shift.manage",
      ]),
    );
  });
});
