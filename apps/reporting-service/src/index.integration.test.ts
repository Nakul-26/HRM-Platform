import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { loadEnv, baseEnvSchema } from "@hrm/config";
import { createDbClient, createTenant, schema, type Database } from "@hrm/db";
import { signAccessToken } from "@hrm/auth";
import { PERMISSIONS, type AuthContext, type Permission } from "@hrm/types";
import { app } from "./index";

/**
 * Exercises the full HTTP surface of the reporting-service against a real
 * Postgres (RLS included) — same pattern as apps/payroll-service's
 * integration suite. AuthContext is synthesized directly with
 * `signAccessToken` since every downstream service trusts a pre-resolved,
 * signed context from the Gateway (docs/architecture/06-security.md).
 */
describe("reporting-service", () => {
  const env = loadEnv(baseEnvSchema);
  const testEnv = {
    APP_DATABASE_URL: env.APP_DATABASE_URL,
    JWT_SIGNING_KEY: env.JWT_SIGNING_KEY,
    JWT_KID: env.JWT_KID,
  };

  let adminDb: Database;
  let tenantA: { id: string };
  let tenantB: { id: string };

  let managerEmployeeA: { id: string };
  let reportEmployeeA: { id: string };
  let strangerEmployeeA: { id: string };
  let employeeB: { id: string };

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

  async function req(method: string, path: string, auth: AuthContext | null) {
    const headers: Record<string, string> = {};
    if (auth) headers.authorization = await bearer(auth);
    return app.request(path, { method, headers }, testEnv);
  }

  const ALL_PERMISSIONS = [...PERMISSIONS] as Permission[];

  beforeAll(async () => {
    adminDb = createDbClient(env.DATABASE_URL);
    const suffix = Math.random().toString(36).slice(2, 8);

    tenantA = await createTenant(adminDb, {
      slug: `reporting-svc-a-${suffix}`,
      name: "Reporting Service Test Tenant A",
      adminEmail: `admin-a-${suffix}@test.local`,
      adminName: "Admin A",
      adminPassword: "Test-Password-123",
    });
    tenantB = await createTenant(adminDb, {
      slug: `reporting-svc-b-${suffix}`,
      name: "Reporting Service Test Tenant B",
      adminEmail: `admin-b-${suffix}@test.local`,
      adminName: "Admin B",
      adminPassword: "Test-Password-123",
    });

    const [manager] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "R-MGR", firstName: "Mona", lastName: "Manager", employmentType: "full_time", dateOfJoining: "2019-01-01", status: "active" })
      .returning();
    const [report] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "R-REPORT", firstName: "Rita", lastName: "Report", managerId: manager!.id, employmentType: "full_time", dateOfJoining: "2019-06-01", status: "active" })
      .returning();
    const [stranger] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "R-STRANGER", firstName: "Sam", lastName: "Stranger", employmentType: "full_time", dateOfJoining: "2019-06-01", status: "active" })
      .returning();
    const [b1] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantB.id, employeeCode: "R-B-ONE", firstName: "Beatrice", lastName: "One", employmentType: "full_time", dateOfJoining: "2019-06-01", status: "active" })
      .returning();

    managerEmployeeA = manager!;
    reportEmployeeA = report!;
    strangerEmployeeA = stranger!;
    employeeB = b1!;

    await adminDb.insert(schema.attendanceRecords).values([
      { tenantId: tenantA.id, employeeId: reportEmployeeA.id, workDate: "2026-01-05", status: "present", source: "manual" },
      { tenantId: tenantA.id, employeeId: reportEmployeeA.id, workDate: "2026-01-06", status: "absent", source: "manual" },
      { tenantId: tenantA.id, employeeId: reportEmployeeA.id, workDate: "2026-01-07", status: "present", source: "manual", lateMinutes: 15 },
    ]);

    const [leaveType] = await adminDb
      .insert(schema.leaveTypes)
      .values({ tenantId: tenantA.id, name: "Casual", isPaid: true })
      .returning();
    await adminDb.insert(schema.leaveBalances).values({
      tenantId: tenantA.id,
      employeeId: reportEmployeeA.id,
      leaveTypeId: leaveType!.id,
      year: 2026,
      entitled: "12",
      used: "2",
      carriedForward: "0",
    });
    await adminDb.insert(schema.leaveRequests).values({
      tenantId: tenantA.id,
      employeeId: reportEmployeeA.id,
      leaveTypeId: leaveType!.id,
      startDate: "2026-01-10",
      endDate: "2026-01-11",
      days: "2",
      status: "approved",
    });

    const [payrollRun] = await adminDb
      .insert(schema.payrollRuns)
      .values({ tenantId: tenantA.id, periodMonth: 1, periodYear: 2026, status: "completed" })
      .returning();
    await adminDb.insert(schema.payslips).values({
      tenantId: tenantA.id,
      payrollRunId: payrollRun!.id,
      employeeId: reportEmployeeA.id,
      grossEarnings: "80000",
      totalDeductions: "10000",
      netPay: "70000",
      breakdown: {},
    });

    await adminDb.insert(schema.auditLogs).values([
      { tenantId: tenantA.id, actorId: managerEmployeeA.id, action: "leave.approved", resourceType: "leave_request", resourceId: reportEmployeeA.id },
      { tenantId: tenantA.id, actorId: managerEmployeeA.id, action: "employee.updated", resourceType: "employee", resourceId: reportEmployeeA.id },
      { tenantId: tenantB.id, actorId: employeeB.id, action: "employee.updated", resourceType: "employee", resourceId: employeeB.id },
    ]);
  });

  afterAll(async () => {
    const tenantIds = [tenantA.id, tenantB.id];
    await adminDb.delete(schema.auditLogs).where(inArray(schema.auditLogs.tenantId, tenantIds));
    await adminDb.delete(schema.payslips).where(inArray(schema.payslips.tenantId, tenantIds));
    await adminDb.delete(schema.payrollRuns).where(inArray(schema.payrollRuns.tenantId, tenantIds));
    await adminDb.delete(schema.leaveRequests).where(inArray(schema.leaveRequests.tenantId, tenantIds));
    await adminDb.delete(schema.leaveBalances).where(inArray(schema.leaveBalances.tenantId, tenantIds));
    await adminDb.delete(schema.leaveTypes).where(inArray(schema.leaveTypes.tenantId, tenantIds));
    await adminDb.delete(schema.attendanceRecords).where(inArray(schema.attendanceRecords.tenantId, tenantIds));
    await adminDb.delete(schema.payrollTaxConfig).where(inArray(schema.payrollTaxConfig.tenantId, tenantIds));
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

  describe("headcount", () => {
    it("scopes to self+reports for reporting.view, org-wide for reporting.view_all", async () => {
      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["reporting.view"] });
      const managerRes = await req("GET", "/api/v1/reporting/headcount/export", manager);
      expect(managerRes.status).toBe(200);
      const managerCsv = await managerRes.text();
      expect(managerCsv).toContain("R-MGR");
      expect(managerCsv).toContain("R-REPORT");
      expect(managerCsv).not.toContain("R-STRANGER");

      const hr = authFor({ employeeId: strangerEmployeeA.id, permissions: ["reporting.view_all"] });
      const hrRes = await req("GET", "/api/v1/reporting/headcount/export", hr);
      const hrCsv = await hrRes.text();
      expect(hrCsv).toContain("R-MGR");
      expect(hrCsv).toContain("R-REPORT");
      expect(hrCsv).toContain("R-STRANGER");
    });

    it("a stranger with no reporting permission at all still sees only themselves", async () => {
      const stranger = authFor({ employeeId: strangerEmployeeA.id, permissions: [] });
      const res = await req("GET", "/api/v1/reporting/headcount/export", stranger);
      const csv = await res.text();
      expect(csv).toContain("R-STRANGER");
      expect(csv).not.toContain("R-REPORT");
    });
  });

  describe("attendance summary", () => {
    it("reports present/absent/late counts scoped to visible employees", async () => {
      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["reporting.view"] });
      const res = await req("GET", "/api/v1/reporting/attendance-summary?from=2026-01-01&to=2026-01-31", manager);
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as { data: { employeeCode: string; presentDays: number; absentDays: number; lateDays: number }[] };
      const reportRow = data.find((r) => r.employeeCode === "R-REPORT");
      expect(reportRow).toBeDefined();
      expect(reportRow?.presentDays).toBe(2);
      expect(reportRow?.absentDays).toBe(1);
      expect(reportRow?.lateDays).toBe(1);
    });
  });

  describe("leave summary", () => {
    it("reports entitled/used/carried-forward balance plus taken-in-period", async () => {
      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["reporting.view"] });
      const res = await req("GET", "/api/v1/reporting/leave-summary?year=2026&from=2026-01-01&to=2026-01-31", manager);
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as { data: { employeeCode: string; entitled: string; used: string; takenInPeriod: string }[] };
      const reportRow = data.find((r) => r.employeeCode === "R-REPORT");
      expect(reportRow).toBeDefined();
      expect(Number(reportRow?.entitled)).toBe(12);
      expect(Number(reportRow?.used)).toBe(2);
      expect(Number(reportRow?.takenInPeriod)).toBe(2);
    });
  });

  describe("payroll summary", () => {
    it("requires reporting.view_all specifically — a scoped reporting.view holder is rejected", async () => {
      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["reporting.view"] });
      const rejected = await req("GET", "/api/v1/reporting/payroll-summary", manager);
      expect(rejected.status).toBe(403);

      const hr = authFor({ employeeId: strangerEmployeeA.id, permissions: ["reporting.view_all"] });
      const allowed = await req("GET", "/api/v1/reporting/payroll-summary", hr);
      expect(allowed.status).toBe(200);
      const { data } = (await allowed.json()) as { data: { periodMonth: number; periodYear: number; netPay: string }[] };
      const row = data.find((r) => r.periodMonth === 1 && r.periodYear === 2026);
      expect(row).toBeDefined();
      expect(Number(row?.netPay)).toBe(70000);
    });
  });

  describe("audit log", () => {
    it("requires audit_log.read, filters by action, and never leaks another tenant's rows", async () => {
      const noPerm = authFor({ employeeId: strangerEmployeeA.id, permissions: [] });
      const rejected = await req("GET", "/api/v1/reporting/audit-log", noPerm);
      expect(rejected.status).toBe(403);

      const hr = authFor({ employeeId: strangerEmployeeA.id, permissions: ["audit_log.read"] });
      const all = await req("GET", "/api/v1/reporting/audit-log?pageSize=100", hr);
      expect(all.status).toBe(200);
      const { data: allRows } = (await all.json()) as { data: { action: string; tenantId: string }[] };
      expect(allRows.every((r) => r.tenantId === tenantA.id)).toBe(true);
      expect(allRows.some((r) => r.action === "leave.approved")).toBe(true);
      expect(allRows.some((r) => r.action === "employee.updated")).toBe(true);

      const filtered = await req("GET", "/api/v1/reporting/audit-log?action=leave.approved", hr);
      const { data: filteredRows } = (await filtered.json()) as { data: { action: string }[] };
      expect(filteredRows.every((r) => r.action === "leave.approved")).toBe(true);
      expect(filteredRows.length).toBeGreaterThan(0);
    });

    it("exports as CSV with a header row and matching content-type", async () => {
      const hr = authFor({ employeeId: strangerEmployeeA.id, permissions: ["audit_log.read"] });
      const res = await req("GET", "/api/v1/reporting/audit-log/export", hr);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/csv");
      const csv = await res.text();
      expect(csv.split("\n")[0]).toContain("Action");
      expect(csv).toContain("leave.approved");
    });
  });

  it("every reporting.* permission referenced by this service exists in the shared PERMISSIONS catalog", () => {
    const reportingPermissions = ALL_PERMISSIONS.filter((p) => p.startsWith("reporting."));
    expect(reportingPermissions).toEqual(expect.arrayContaining(["reporting.view", "reporting.view_all"]));
  });
});
