import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { loadEnv, baseEnvSchema } from "@hrm/config";
import { createDbClient, createTenant, schema, type Database } from "@hrm/db";
import { signAccessToken } from "@hrm/auth";
import { PERMISSIONS, type AuthContext, type Permission } from "@hrm/types";
import { app } from "./index";
import { enumerateBusinessDays } from "./lib/leaveDays";

/**
 * Exercises the full HTTP surface of the leave-service against a real
 * Postgres (RLS included), not mocks — same pattern as
 * apps/employee-service/src/index.integration.test.ts. AuthContext is
 * synthesized directly with `signAccessToken` since every downstream
 * service trusts a pre-resolved, signed context from the Gateway
 * (docs/architecture/06-security.md).
 */
describe("leave-service", () => {
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

  let paidLeaveTypeA: { id: string };
  let unpaidLeaveTypeA: { id: string };

  const currentYear = new Date().getUTCFullYear();

  function nextWeekday(base: Date, minDaysAhead: number): Date {
    const d = new Date(base);
    d.setUTCDate(d.getUTCDate() + minDaysAhead);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }
  function iso(d: Date): string {
    return d.toISOString().slice(0, 10);
  }
  function addWeekdays(start: Date, count: number): Date {
    const d = new Date(start);
    let added = 0;
    while (added < count) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) added++;
    }
    return d;
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
      slug: `leave-svc-a-${suffix}`,
      name: "Leave Service Test Tenant A",
      adminEmail: `admin-a-${suffix}@test.local`,
      adminName: "Admin A",
      adminPassword: "Test-Password-123",
    });
    tenantB = await createTenant(adminDb, {
      slug: `leave-svc-b-${suffix}`,
      name: "Leave Service Test Tenant B",
      adminEmail: `admin-b-${suffix}@test.local`,
      adminName: "Admin B",
      adminPassword: "Test-Password-123",
    });

    const [admin] = await adminDb
      .insert(schema.employees)
      .values({
        tenantId: tenantA.id,
        employeeCode: "L-ADMIN",
        firstName: "Ada",
        lastName: "Admin",
        employmentType: "full_time",
        dateOfJoining: "2020-01-01",
        status: "active",
      })
      .returning();
    const [manager] = await adminDb
      .insert(schema.employees)
      .values({
        tenantId: tenantA.id,
        employeeCode: "L-MGR",
        firstName: "Mona",
        lastName: "Manager",
        employmentType: "full_time",
        dateOfJoining: "2020-01-01",
        status: "active",
      })
      .returning();
    const [report] = await adminDb
      .insert(schema.employees)
      .values({
        tenantId: tenantA.id,
        employeeCode: "L-REPORT",
        firstName: "Rita",
        lastName: "Report",
        managerId: manager!.id,
        employmentType: "full_time",
        dateOfJoining: "2021-06-01",
        status: "active",
      })
      .returning();
    const [other] = await adminDb
      .insert(schema.employees)
      .values({
        tenantId: tenantA.id,
        employeeCode: "L-OTHER",
        firstName: "Oscar",
        lastName: "Other",
        employmentType: "full_time",
        dateOfJoining: "2021-06-01",
        status: "active",
      })
      .returning();
    const [b1] = await adminDb
      .insert(schema.employees)
      .values({
        tenantId: tenantB.id,
        employeeCode: "L-B-ONE",
        firstName: "Beatrice",
        lastName: "One",
        employmentType: "full_time",
        dateOfJoining: "2021-06-01",
        status: "active",
      })
      .returning();

    adminEmployeeA = admin!;
    managerEmployeeA = manager!;
    reportEmployeeA = report!;
    otherEmployeeA = other!;
    employeeB = b1!;

    const [paidType] = await adminDb
      .insert(schema.leaveTypes)
      .values({ tenantId: tenantA.id, name: "Paid Test Leave", isPaid: true })
      .returning();
    const [unpaidType] = await adminDb
      .insert(schema.leaveTypes)
      .values({ tenantId: tenantA.id, name: "Unpaid Test Leave", isPaid: false })
      .returning();
    paidLeaveTypeA = paidType!;
    unpaidLeaveTypeA = unpaidType!;

    // Enough balance for the "approve increments used" / "cancel" happy-path
    // tests without also exercising insufficient-balance logic there.
    await adminDb.insert(schema.leaveBalances).values({
      tenantId: tenantA.id,
      employeeId: reportEmployeeA.id,
      leaveTypeId: paidLeaveTypeA.id,
      year: currentYear,
      entitled: "10",
      used: "0",
      carriedForward: "0",
    });
  });

  afterAll(async () => {
    const tenantIds = [tenantA.id, tenantB.id];
    await adminDb.delete(schema.attendanceRecords).where(inArray(schema.attendanceRecords.tenantId, tenantIds));
    await adminDb.delete(schema.leaveRequests).where(inArray(schema.leaveRequests.tenantId, tenantIds));
    await adminDb.delete(schema.leaveBalances).where(inArray(schema.leaveBalances.tenantId, tenantIds));
    await adminDb.delete(schema.leaveTypes).where(inArray(schema.leaveTypes.tenantId, tenantIds));
    await adminDb.delete(schema.holidayCalendar).where(inArray(schema.holidayCalendar.tenantId, tenantIds));
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

  describe("leave types", () => {
    it("requires leave.policy.manage to create, and rejects everyone else", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["leave.policy.manage"] });
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: ["leave.apply"] });

      const created = await req("POST", "/api/v1/leave/types", admin, { name: "Casual Leave", isPaid: true });
      expect(created.status).toBe(201);

      const rejected = await req("POST", "/api/v1/leave/types", noPerm, { name: "Sick Leave" });
      expect(rejected.status).toBe(403);
    });

    it("is listable by any authenticated user without leave.policy.manage", async () => {
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: ["leave.apply"] });
      const res = await req("GET", "/api/v1/leave/types?pageSize=100", noPerm);
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as { data: { name: string }[] };
      expect(data.some((t) => t.name === "Paid Test Leave")).toBe(true);
    });
  });

  describe("holidays", () => {
    it("requires leave.policy.manage to create, and is listable by anyone", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["leave.policy.manage"] });
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: ["leave.apply"] });

      const created = await req("POST", "/api/v1/leave/holidays", admin, { name: "Founders Day", date: "2031-03-15" });
      expect(created.status).toBe(201);

      const rejected = await req("POST", "/api/v1/leave/holidays", noPerm, { name: "Made Up Day", date: "2031-04-01" });
      expect(rejected.status).toBe(403);

      const list = await req("GET", "/api/v1/leave/holidays?pageSize=100", noPerm);
      expect(list.status).toBe(200);
    });
  });

  describe("leave requests: apply", () => {
    it("requires leave.apply and a linked employeeId", async () => {
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: [] });
      const startDate = iso(nextWeekday(new Date(), 3));
      const endDate = iso(nextWeekday(new Date(startDate), 1));

      const res = await req("POST", "/api/v1/leave/requests", noPerm, {
        leaveTypeId: unpaidLeaveTypeA.id,
        startDate,
        endDate,
      });
      expect(res.status).toBe(403);
    });

    it("rejects a paid-type request that exceeds available balance", async () => {
      const applicant = authFor({ employeeId: otherEmployeeA.id, permissions: ["leave.apply"] });
      const startDate = iso(nextWeekday(new Date(), 3));
      const endDate = iso(nextWeekday(new Date(startDate), 1));

      const res = await req("POST", "/api/v1/leave/requests", applicant, {
        leaveTypeId: paidLeaveTypeA.id,
        startDate,
        endDate,
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("INSUFFICIENT_BALANCE");
    });

    it("allows an unpaid-type request regardless of balance", async () => {
      const applicant = authFor({ employeeId: otherEmployeeA.id, permissions: ["leave.apply"] });
      const startDate = iso(nextWeekday(new Date(), 10));
      const endDate = iso(nextWeekday(new Date(startDate), 1));

      const res = await req("POST", "/api/v1/leave/requests", applicant, {
        leaveTypeId: unpaidLeaveTypeA.id,
        startDate,
        endDate,
        reason: "Personal",
      });
      expect(res.status).toBe(201);
      const { data } = (await res.json()) as { data: { status: string; days: number } };
      expect(data.status).toBe("pending");
      expect(data.days).toBe(2);
    });

    it("rejects a request spanning two different calendar years", async () => {
      const applicant = authFor({ employeeId: otherEmployeeA.id, permissions: ["leave.apply"] });
      const res = await req("POST", "/api/v1/leave/requests", applicant, {
        leaveTypeId: unpaidLeaveTypeA.id,
        startDate: `${currentYear}-12-30`,
        endDate: `${currentYear + 1}-01-02`,
      });
      expect(res.status).toBe(400);
    });
  });

  describe("leave requests: state machine", () => {
    async function applyForReport() {
      const applicant = authFor({ employeeId: reportEmployeeA.id, permissions: ["leave.apply"] });
      const startDate = iso(nextWeekday(new Date(), 20));
      const endDate = startDate;
      const res = await req("POST", "/api/v1/leave/requests", applicant, {
        leaveTypeId: paidLeaveTypeA.id,
        startDate,
        endDate,
      });
      expect(res.status).toBe(201);
      return ((await res.json()) as { data: { id: string; days: number } }).data;
    }

    it("lets the owner cancel their own pending request, but not twice", async () => {
      const created = await applyForReport();
      const owner = authFor({ employeeId: reportEmployeeA.id, permissions: ["leave.apply"] });

      const cancelled = await req("PATCH", `/api/v1/leave/requests/${created.id}/cancel`, owner);
      expect(cancelled.status).toBe(200);

      const secondCancel = await req("PATCH", `/api/v1/leave/requests/${created.id}/cancel`, owner);
      expect(secondCancel.status).toBe(409);
    });

    it("forbids a non-owner from cancelling someone else's request", async () => {
      const created = await applyForReport();
      const peer = authFor({ employeeId: otherEmployeeA.id, permissions: ["leave.apply"] });

      const res = await req("PATCH", `/api/v1/leave/requests/${created.id}/cancel`, peer);
      expect(res.status).toBe(403);
    });

    it("lets the direct manager approve, increments the balance's used field, and rejects re-deciding", async () => {
      const created = await applyForReport();
      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["leave.approve"] });

      const balanceBefore = await req(
        "GET",
        "/api/v1/leave/balances",
        authFor({ employeeId: adminEmployeeA.id, permissions: ["leave.approve_all"] }),
      );
      const before = ((await balanceBefore.json()) as { data: { employeeId: string; leaveTypeId: string; used: number }[] }).data.find(
        (b) => b.employeeId === reportEmployeeA.id && b.leaveTypeId === paidLeaveTypeA.id,
      );

      const approved = await req("PATCH", `/api/v1/leave/requests/${created.id}/approve`, manager);
      expect(approved.status).toBe(200);
      const approvedBody = (await approved.json()) as { data: { status: string } };
      expect(approvedBody.data.status).toBe("approved");

      const balanceAfter = await req(
        "GET",
        "/api/v1/leave/balances",
        authFor({ employeeId: adminEmployeeA.id, permissions: ["leave.approve_all"] }),
      );
      const after = ((await balanceAfter.json()) as { data: { employeeId: string; leaveTypeId: string; used: number }[] }).data.find(
        (b) => b.employeeId === reportEmployeeA.id && b.leaveTypeId === paidLeaveTypeA.id,
      );
      expect(after?.used).toBe((before?.used ?? 0) + created.days);

      const reDecide = await req("PATCH", `/api/v1/leave/requests/${created.id}/reject`, manager);
      expect(reDecide.status).toBe(409);
    });

    it("rejects approving a second pending request that would push used past the balance, even though each individually fit at apply time", async () => {
      // Applying never reserves balance against other still-pending requests
      // — two 6-day requests each fit reportEmployeeA's 10-day balance on
      // their own, but approving both would total 12. The approve handler
      // must re-check sufficiency itself, not just trust the apply-time check.
      const applicant = authFor({ employeeId: reportEmployeeA.id, permissions: ["leave.apply"] });
      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["leave.approve"] });

      const start1 = iso(nextWeekday(new Date(), 50));
      const end1 = iso(addWeekdays(new Date(start1), 5));
      const res1 = await req("POST", "/api/v1/leave/requests", applicant, {
        leaveTypeId: paidLeaveTypeA.id,
        startDate: start1,
        endDate: end1,
      });
      expect(res1.status).toBe(201);
      const request1 = ((await res1.json()) as { data: { id: string; days: number } }).data;
      expect(request1.days).toBe(6);

      const start2 = iso(nextWeekday(new Date(), 65));
      const end2 = iso(addWeekdays(new Date(start2), 5));
      const res2 = await req("POST", "/api/v1/leave/requests", applicant, {
        leaveTypeId: paidLeaveTypeA.id,
        startDate: start2,
        endDate: end2,
      });
      expect(res2.status).toBe(201);
      const request2 = ((await res2.json()) as { data: { id: string } }).data;

      const firstApproval = await req("PATCH", `/api/v1/leave/requests/${request1.id}/approve`, manager);
      expect(firstApproval.status).toBe(200);

      const secondApproval = await req("PATCH", `/api/v1/leave/requests/${request2.id}/approve`, manager);
      expect(secondApproval.status).toBe(409);
      const body = (await secondApproval.json()) as { error: { code: string } };
      expect(body.error.code).toBe("INSUFFICIENT_BALANCE");

      const secondStillPending = await req("GET", `/api/v1/leave/requests/${request2.id}`, manager);
      expect(((await secondStillPending.json()) as { data: { status: string } }).data.status).toBe("pending");
    });

    it("forbids an unrelated peer (no direct-report relationship) from approving", async () => {
      const created = await applyForReport();
      const peer = authFor({ employeeId: otherEmployeeA.id, permissions: ["leave.approve"] });

      const res = await req("PATCH", `/api/v1/leave/requests/${created.id}/approve`, peer);
      expect(res.status).toBe(403);
    });

    it("lets an org-wide approver reject with a decision note, without touching the balance", async () => {
      const applicant = authFor({ employeeId: otherEmployeeA.id, permissions: ["leave.apply"] });
      const startDate = iso(nextWeekday(new Date(), 25));
      const res = await req("POST", "/api/v1/leave/requests", applicant, {
        leaveTypeId: unpaidLeaveTypeA.id,
        startDate,
        endDate: startDate,
      });
      const created = ((await res.json()) as { data: { id: string } }).data;

      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["leave.approve_all"] });
      const rejected = await req("PATCH", `/api/v1/leave/requests/${created.id}/reject`, admin, {
        reason: "Team is short-staffed that week",
      });
      expect(rejected.status).toBe(200);
      const body = (await rejected.json()) as { data: { status: string; decisionNote: string | null; reason: string | null } };
      expect(body.data.status).toBe("rejected");
      expect(body.data.decisionNote).toBe("Team is short-staffed that week");
    });
  });

  describe("leave requests: list scoping", () => {
    it("org-wide approver sees requests across employees; a plain scoped approver sees only self + direct reports", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["leave.approve_all"] });
      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["leave.approve"] });

      const adminList = await req("GET", "/api/v1/leave/requests?pageSize=100", admin);
      const adminIds = ((await adminList.json()) as { data: { employeeId: string }[] }).data.map((r) => r.employeeId);
      expect(adminIds).toContain(otherEmployeeA.id);
      expect(adminIds).toContain(reportEmployeeA.id);

      const managerList = await req("GET", "/api/v1/leave/requests?pageSize=100", manager);
      const managerIds = ((await managerList.json()) as { data: { employeeId: string }[] }).data.map((r) => r.employeeId);
      expect(managerIds).toContain(reportEmployeeA.id); // direct report
      expect(managerIds).not.toContain(otherEmployeeA.id); // not a report of this manager
    });

    it("a plain applicant with no approve permission sees only their own requests", async () => {
      const self = authFor({ employeeId: otherEmployeeA.id, permissions: ["leave.apply"] });
      const res = await req("GET", "/api/v1/leave/requests?pageSize=100", self);
      const ids = ((await res.json()) as { data: { employeeId: string }[] }).data.map((r) => r.employeeId);
      expect(ids.every((id) => id === otherEmployeeA.id)).toBe(true);
    });
  });

  describe("cross-tenant isolation", () => {
    it("tenant B's org-wide approver cannot see or act on tenant A's leave request (RLS, not just app logic)", async () => {
      const applicant = authFor({ employeeId: otherEmployeeA.id, permissions: ["leave.apply"] });
      const startDate = iso(nextWeekday(new Date(), 30));
      const res = await req("POST", "/api/v1/leave/requests", applicant, {
        leaveTypeId: unpaidLeaveTypeA.id,
        startDate,
        endDate: startDate,
      });
      const created = ((await res.json()) as { data: { id: string } }).data;

      const tenantBApprover = authFor({ tenantId: tenantB.id, employeeId: employeeB.id, permissions: ["leave.approve_all"] });
      const getRes = await req("GET", `/api/v1/leave/requests/${created.id}`, tenantBApprover);
      expect(getRes.status).toBe(404);

      const approveRes = await req("PATCH", `/api/v1/leave/requests/${created.id}/approve`, tenantBApprover);
      expect(approveRes.status).toBe(404);
    });
  });

  describe("accrual", () => {
    it("is idempotent within the same period via the manual-trigger endpoint", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["leave.policy.manage"] });

      await req("POST", "/api/v1/leave/types", admin, {
        name: "Accrual Test Leave",
        isPaid: true,
        accrualRule: { per: "month", days: 1.5 },
      });

      const firstRun = await req("POST", "/api/v1/leave/balances/accrual/run", admin);
      expect(firstRun.status).toBe(200);
      const firstResult = (await firstRun.json()) as { data: { balancesUpdated: number } };
      expect(firstResult.data.balancesUpdated).toBeGreaterThan(0);

      const balancesAfterFirst = await req("GET", "/api/v1/leave/balances", admin);
      const accrualType = (
        (await (await req("GET", "/api/v1/leave/types?pageSize=100", admin)).json()) as { data: { id: string; name: string }[] }
      ).data.find((t) => t.name === "Accrual Test Leave");
      const beforeEntitled = ((await balancesAfterFirst.json()) as { data: { employeeId: string; leaveTypeId: string; entitled: number }[] }).data.find(
        (b) => b.employeeId === reportEmployeeA.id && b.leaveTypeId === accrualType?.id,
      )?.entitled;

      const secondRun = await req("POST", "/api/v1/leave/balances/accrual/run", admin);
      expect(secondRun.status).toBe(200);
      const secondResult = (await secondRun.json()) as { data: { balancesUpdated: number } };
      expect(secondResult.data.balancesUpdated).toBe(0); // same period — nothing left to accrue

      const balancesAfterSecond = await req("GET", "/api/v1/leave/balances", admin);
      const afterEntitled = ((await balancesAfterSecond.json()) as { data: { employeeId: string; leaveTypeId: string; entitled: number }[] }).data.find(
        (b) => b.employeeId === reportEmployeeA.id && b.leaveTypeId === accrualType?.id,
      )?.entitled;

      expect(afterEntitled).toBe(beforeEntitled);
    });

    it("only accrues the caller's own tenant, never a different one", async () => {
      const adminA = authFor({ employeeId: adminEmployeeA.id, permissions: ["leave.policy.manage"] });
      await req("POST", "/api/v1/leave/balances/accrual/run", adminA);

      const adminB = authFor({ tenantId: tenantB.id, employeeId: employeeB.id, permissions: ["leave.policy.manage"] });
      const listB = await req("GET", "/api/v1/leave/balances", adminB);
      const dataB = ((await listB.json()) as { data: unknown[] }).data;
      expect(dataB).toHaveLength(0); // tenant B has no accruable leave types of its own
    });
  });

  describe("leave -> attendance reconciliation", () => {
    it("creates attendance_records rows with status on_leave for each covered business day after approval (Phase 2 DoD: no manual reconciliation)", async () => {
      const applicant = authFor({ employeeId: otherEmployeeA.id, permissions: ["leave.apply"] });
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["leave.approve_all"] });

      const startDate = iso(nextWeekday(new Date(), 80));
      const endDate = iso(addWeekdays(new Date(startDate), 2)); // 3 business days total

      const res = await req("POST", "/api/v1/leave/requests", applicant, {
        leaveTypeId: unpaidLeaveTypeA.id,
        startDate,
        endDate,
      });
      expect(res.status).toBe(201);
      const created = ((await res.json()) as { data: { id: string; days: number } }).data;
      expect(created.days).toBe(3);

      const approved = await req("PATCH", `/api/v1/leave/requests/${created.id}/approve`, admin);
      expect(approved.status).toBe(200);

      const records = await adminDb
        .select()
        .from(schema.attendanceRecords)
        .where(and(eq(schema.attendanceRecords.tenantId, tenantA.id), eq(schema.attendanceRecords.employeeId, otherEmployeeA.id)));

      const coveredDates = enumerateBusinessDays(startDate, endDate);
      expect(coveredDates).toHaveLength(3);
      for (const date of coveredDates) {
        const record = records.find((r) => r.workDate === date);
        expect(record?.status).toBe("on_leave");
      }
    });
  });

  it("sanity: the leave permission strings used above still exist in the shared catalog", () => {
    expect(ALL_PERMISSIONS).toEqual(
      expect.arrayContaining(["leave.apply", "leave.approve", "leave.approve_all", "leave.policy.manage"]),
    );
  });
});
