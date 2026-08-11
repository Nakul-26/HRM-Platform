import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { loadEnv, baseEnvSchema } from "@hrm/config";
import { createDbClient, createTenant, schema, type Database } from "@hrm/db";
import { signAccessToken } from "@hrm/auth";
import { PERMISSIONS, type AuthContext, type Permission } from "@hrm/types";
import { app } from "./index";

/**
 * Exercises the full HTTP surface of the payroll-service against a real
 * Postgres (RLS included) and the real local MinIO instance for PDF
 * storage — same pattern as apps/leave-service and apps/attendance-service's
 * integration suites. AuthContext is synthesized directly with
 * `signAccessToken` since every downstream service trusts a pre-resolved,
 * signed context from the Gateway (docs/architecture/06-security.md).
 */
describe("payroll-service", () => {
  const env = loadEnv(baseEnvSchema);
  const testEnv = {
    APP_DATABASE_URL: env.APP_DATABASE_URL,
    JWT_SIGNING_KEY: env.JWT_SIGNING_KEY,
    JWT_KID: env.JWT_KID,
    S3_ENDPOINT: "http://localhost:9000",
    S3_ACCESS_KEY_ID: "minioadmin",
    S3_SECRET_ACCESS_KEY: "minioadmin",
    S3_BUCKET: "hrm-documents",
  };

  let adminDb: Database;
  let tenantA: { id: string };
  let tenantB: { id: string };

  let adminEmployeeA: { id: string };
  let managerEmployeeA: { id: string };
  let reportEmployeeA: { id: string };
  let otherEmployeeA: { id: string };
  let employeeB: { id: string };
  let payEmployeeA: { id: string };

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
      slug: `payroll-svc-a-${suffix}`,
      name: "Payroll Service Test Tenant A",
      adminEmail: `admin-a-${suffix}@test.local`,
      adminName: "Admin A",
      adminPassword: "Test-Password-123",
    });
    tenantB = await createTenant(adminDb, {
      slug: `payroll-svc-b-${suffix}`,
      name: "Payroll Service Test Tenant B",
      adminEmail: `admin-b-${suffix}@test.local`,
      adminName: "Admin B",
      adminPassword: "Test-Password-123",
    });

    const [admin] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "P-ADMIN", firstName: "Ada", lastName: "Admin", employmentType: "full_time", dateOfJoining: "2019-01-01", status: "active" })
      .returning();
    const [manager] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "P-MGR", firstName: "Mona", lastName: "Manager", employmentType: "full_time", dateOfJoining: "2019-01-01", status: "active" })
      .returning();
    const [report] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "P-REPORT", firstName: "Rita", lastName: "Report", managerId: manager!.id, employmentType: "full_time", dateOfJoining: "2019-06-01", status: "active" })
      .returning();
    const [other] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "P-OTHER", firstName: "Oscar", lastName: "Other", employmentType: "full_time", dateOfJoining: "2019-06-01", status: "active" })
      .returning();
    const [b1] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantB.id, employeeCode: "P-B-ONE", firstName: "Beatrice", lastName: "One", employmentType: "full_time", dateOfJoining: "2019-06-01", status: "active" })
      .returning();
    const [payEmployee] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "P-PAY", firstName: "Priya", lastName: "Payslip", employmentType: "full_time", dateOfJoining: "2019-01-01", status: "active" })
      .returning();

    adminEmployeeA = admin!;
    managerEmployeeA = manager!;
    reportEmployeeA = report!;
    otherEmployeeA = other!;
    employeeB = b1!;
    payEmployeeA = payEmployee!;

    await adminDb.insert(schema.payComponentTypes).values([
      { tenantId: tenantA.id, code: "basic", name: "Basic", category: "earning", calculationType: "fixed", isTaxable: true },
      { tenantId: tenantA.id, code: "hra", name: "HRA", category: "earning", calculationType: "fixed", isTaxable: true },
      { tenantId: tenantA.id, code: "special_allowance", name: "Special Allowance", category: "earning", calculationType: "fixed", isTaxable: true },
    ]);

    // Every calendar day of March 2021 marked `present` for payEmployeeA —
    // only the 23 business days within it are actually read by the LOP
    // calculation, but inserting the full month is simpler than computing
    // which are weekdays. This makes the worked-example execute test below
    // reproduce the hand-verified numbers exactly (zero LOP).
    await adminDb.insert(schema.attendanceRecords).values(
      Array.from({ length: 31 }, (_, i) => ({
        tenantId: tenantA.id,
        employeeId: payEmployeeA.id,
        workDate: `2021-03-${String(i + 1).padStart(2, "0")}`,
        status: "present",
        source: "manual" as const,
      })),
    );
  });

  afterAll(async () => {
    const tenantIds = [tenantA.id, tenantB.id];
    await adminDb.delete(schema.payslips).where(inArray(schema.payslips.tenantId, tenantIds));
    await adminDb.delete(schema.payrollRuns).where(inArray(schema.payrollRuns.tenantId, tenantIds));
    await adminDb.delete(schema.salaryStructures).where(inArray(schema.salaryStructures.tenantId, tenantIds));
    await adminDb.delete(schema.payComponentTypes).where(inArray(schema.payComponentTypes.tenantId, tenantIds));
    await adminDb.delete(schema.payrollTaxConfig).where(inArray(schema.payrollTaxConfig.tenantId, tenantIds));
    await adminDb.delete(schema.notifications).where(inArray(schema.notifications.tenantId, tenantIds));
    await adminDb.delete(schema.attendanceRecords).where(inArray(schema.attendanceRecords.tenantId, tenantIds));
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

  describe("component types", () => {
    it("requires payroll.structure.manage to create, but list is open to any authenticated user", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["payroll.structure.manage"] });
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: [] });

      const created = await req("POST", "/api/v1/payroll/component-types", admin, {
        code: "loan_recovery",
        name: "Loan Recovery",
        category: "deduction",
      });
      expect(created.status).toBe(201);

      const rejected = await req("POST", "/api/v1/payroll/component-types", noPerm, { code: "bogus", name: "Bogus", category: "earning" });
      expect(rejected.status).toBe(403);

      const list = await req("GET", "/api/v1/payroll/component-types?pageSize=100", noPerm);
      expect(list.status).toBe(200);
      const { data } = (await list.json()) as { data: { code: string }[] };
      expect(data.some((c) => c.code === "basic")).toBe(true);
    });
  });

  describe("tax config", () => {
    it("requires payroll.structure.manage for both read and update, and returns sane seeded defaults", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["payroll.structure.manage"] });
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: [] });

      const rejected = await req("GET", "/api/v1/payroll/tax-config", noPerm);
      expect(rejected.status).toBe(403);

      const got = await req("GET", "/api/v1/payroll/tax-config", admin);
      expect(got.status).toBe(200);
      const { data } = (await got.json()) as { data: { pfEmployeeRate: number; esiWageThreshold: number } };
      expect(data.pfEmployeeRate).toBe(0.12);
      expect(data.esiWageThreshold).toBe(21000);

      const updated = await req("PATCH", "/api/v1/payroll/tax-config", admin, { esiWageThreshold: 25000 });
      expect(updated.status).toBe(200);
      const { data: updatedData } = (await updated.json()) as { data: { esiWageThreshold: number } };
      expect(updatedData.esiWageThreshold).toBe(25000);

      // restore, so other tests in this file keep the default threshold
      await req("PATCH", "/api/v1/payroll/tax-config", admin, { esiWageThreshold: 21000 });
    });
  });

  describe("salary structures", () => {
    it("requires payroll.structure.manage to create; self and a direct manager can view; an unrelated employee cannot", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["payroll.structure.manage"] });
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: [] });

      const rejectedCreate = await req("POST", "/api/v1/payroll/salary-structures", noPerm, {
        employeeId: reportEmployeeA.id,
        effectiveFrom: "2020-01-01",
        components: [{ code: "basic", amount: 30_000 }],
      });
      expect(rejectedCreate.status).toBe(403);

      const created = await req("POST", "/api/v1/payroll/salary-structures", admin, {
        employeeId: reportEmployeeA.id,
        effectiveFrom: "2020-01-01",
        components: [{ code: "basic", amount: 30_000 }],
      });
      expect(created.status).toBe(201);
      const { data: structure } = (await created.json()) as { data: { id: string } };

      const self = authFor({ employeeId: reportEmployeeA.id, permissions: ["payroll.view"] });
      const selfView = await req("GET", `/api/v1/payroll/salary-structures/${structure.id}`, self);
      expect(selfView.status).toBe(200);

      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["payroll.view"] });
      const managerView = await req("GET", `/api/v1/payroll/salary-structures/${structure.id}`, manager);
      expect(managerView.status).toBe(200);

      const stranger = authFor({ employeeId: otherEmployeeA.id, permissions: ["payroll.view"] });
      const strangerView = await req("GET", `/api/v1/payroll/salary-structures/${structure.id}`, stranger);
      expect(strangerView.status).toBe(403);
    });

    it("is not visible cross-tenant even to an org-wide viewer of the other tenant", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["payroll.structure.manage"] });
      const created = await req("POST", "/api/v1/payroll/salary-structures", admin, {
        employeeId: otherEmployeeA.id,
        effectiveFrom: "2020-01-01",
        components: [{ code: "basic", amount: 20_000 }],
      });
      const { data: structure } = (await created.json()) as { data: { id: string } };

      const otherTenantViewer = authFor({ tenantId: tenantB.id, employeeId: employeeB.id, permissions: ["payroll.view_all"] });
      const res = await req("GET", `/api/v1/payroll/salary-structures/${structure.id}`, otherTenantViewer);
      expect(res.status).toBe(404);
    });
  });

  describe("payroll runs", () => {
    it("requires payroll.run to create or execute, and payroll.view_all to list/read", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["payroll.run", "payroll.view_all"] });
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: [] });

      const rejectedCreate = await req("POST", "/api/v1/payroll/runs", noPerm, { periodMonth: 1, periodYear: 2022 });
      expect(rejectedCreate.status).toBe(403);

      const created = await req("POST", "/api/v1/payroll/runs", admin, { periodMonth: 1, periodYear: 2022 });
      expect(created.status).toBe(201);

      const rejectedList = await req("GET", "/api/v1/payroll/runs", noPerm);
      expect(rejectedList.status).toBe(403);
      const list = await req("GET", "/api/v1/payroll/runs", admin);
      expect(list.status).toBe(200);
    });

    it("creating a run twice for the same period is a safe no-op, returning the same run rather than a conflict error", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["payroll.run"] });

      const first = await req("POST", "/api/v1/payroll/runs", admin, { periodMonth: 2, periodYear: 2022 });
      expect(first.status).toBe(201);
      const { data: firstRun } = (await first.json()) as { data: { id: string } };

      const second = await req("POST", "/api/v1/payroll/runs", admin, { periodMonth: 2, periodYear: 2022 });
      expect(second.status).toBe(201);
      const { data: secondRun } = (await second.json()) as { data: { id: string } };

      expect(secondRun.id).toBe(firstRun.id);
    });

    it(
      "executes a run and matches the hand-verified worked example to the paisa: Basic 50,000 + HRA 20,000 + " +
        "Special Allowance 10,000 = Gross 80,000, PF 6,000, ESI 0, TDS ~3,336.67, Net ~70,663.33 — and generates a downloadable PDF",
      async () => {
        const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["payroll.structure.manage", "payroll.run", "payroll.view_all"] });

        const structureRes = await req("POST", "/api/v1/payroll/salary-structures", admin, {
          employeeId: payEmployeeA.id,
          effectiveFrom: "2020-01-01",
          components: [
            { code: "basic", amount: 50_000 },
            { code: "hra", amount: 20_000 },
            { code: "special_allowance", amount: 10_000 },
          ],
        });
        expect(structureRes.status).toBe(201);

        const runRes = await req("POST", "/api/v1/payroll/runs", admin, { periodMonth: 3, periodYear: 2021 });
        expect(runRes.status).toBe(201);
        const { data: run } = (await runRes.json()) as { data: { id: string } };

        const executeRes = await req("POST", `/api/v1/payroll/runs/${run.id}/execute`, admin);
        expect(executeRes.status).toBe(200);
        const { data: executed } = (await executeRes.json()) as {
          data: { run: { status: string }; payslips: { employeeId: string; grossEarnings: number; totalDeductions: number; netPay: number; r2ObjectKey: string | null }[] };
        };
        expect(executed.run.status).toBe("completed");

        const payslip = executed.payslips.find((p) => p.employeeId === payEmployeeA.id);
        expect(payslip).toBeDefined();
        expect(payslip?.grossEarnings).toBe(80_000);
        expect(payslip?.totalDeductions).toBeCloseTo(9_336.67, 2);
        expect(payslip?.netPay).toBeCloseTo(70_663.33, 2);
        expect(payslip?.r2ObjectKey).toBeTruthy();

        const payEmployeeAuth = authFor({ employeeId: payEmployeeA.id, permissions: ["payroll.view"] });
        const listRes = await req("GET", "/api/v1/payroll/payslips/me", payEmployeeAuth);
        const { data: myPayslips } = (await listRes.json()) as { data: { id: string }[] };
        const myPayslip = myPayslips.find((p) => p.id);
        expect(myPayslip).toBeDefined();

        const downloadRes = await req("GET", `/api/v1/payroll/payslips/${myPayslip!.id}/download-url`, payEmployeeAuth);
        expect(downloadRes.status).toBe(200);
        const { data: download } = (await downloadRes.json()) as { data: { downloadUrl: string } };
        expect(download.downloadUrl).toContain("hrm-documents");

        const fetched = await fetch(download.downloadUrl);
        expect(fetched.status).toBe(200);
        expect(fetched.headers.get("content-type")).toContain("pdf");
      },
    );

    it("re-executing an already-completed run is a safe no-op — same payslip, not duplicated or recomputed", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["payroll.structure.manage", "payroll.run", "payroll.view_all"] });

      await req("POST", "/api/v1/payroll/salary-structures", admin, {
        employeeId: payEmployeeA.id,
        effectiveFrom: "2020-06-01",
        components: [{ code: "basic", amount: 40_000 }],
      });
      const runRes = await req("POST", "/api/v1/payroll/runs", admin, { periodMonth: 4, periodYear: 2021 });
      const { data: run } = (await runRes.json()) as { data: { id: string } };

      const first = await req("POST", `/api/v1/payroll/runs/${run.id}/execute`, admin);
      expect(first.status).toBe(200);
      const { data: firstResult } = (await first.json()) as { data: { payslips: { id: string; employeeId: string; netPay: number }[] } };
      const firstPayEmployeePayslip = firstResult.payslips.find((p) => p.employeeId === payEmployeeA.id);
      expect(firstPayEmployeePayslip).toBeDefined();

      const second = await req("POST", `/api/v1/payroll/runs/${run.id}/execute`, admin);
      expect(second.status).toBe(200);
      const { data: secondResult } = (await second.json()) as {
        data: { run: { status: string }; payslips: { id: string; employeeId: string; netPay: number }[] };
      };
      const secondPayEmployeePayslip = secondResult.payslips.find((p) => p.employeeId === payEmployeeA.id);

      expect(secondResult.run.status).toBe("completed");
      expect(secondResult.payslips).toHaveLength(firstResult.payslips.length);
      expect(secondPayEmployeePayslip?.id).toBe(firstPayEmployeePayslip?.id);
      expect(secondPayEmployeePayslip?.netPay).toBe(firstPayEmployeePayslip?.netPay);

      // Not duplicated per employee — one payslip row per employee for this run, however many employees it covers.
      const payslipRows = await adminDb.select().from(schema.payslips).where(inArray(schema.payslips.payrollRunId, [run.id]));
      expect(new Set(payslipRows.map((p) => p.employeeId)).size).toBe(payslipRows.length);
    });

    it("under truly concurrent executes of the same draft run, exactly one payslip set is produced and nothing crashes", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["payroll.structure.manage", "payroll.run", "payroll.view_all"] });

      // Reuses whichever salary structure is already active for payEmployeeA as of this period (from the previous test) — deliberately not creating a new one, since a second insert at the same effectiveFrom would collide with the unique constraint.
      const runRes = await req("POST", "/api/v1/payroll/runs", admin, { periodMonth: 5, periodYear: 2021 });
      const { data: run } = (await runRes.json()) as { data: { id: string } };

      const responses = await Promise.all(Array.from({ length: 8 }, () => req("POST", `/api/v1/payroll/runs/${run.id}/execute`, admin)));
      const statuses = responses.map((r) => r.status).sort();
      expect(statuses.filter((s) => s !== 200 && s !== 409)).toHaveLength(0);
      expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);

      // No employee's payslip was duplicated by the concurrent executes racing each other.
      const payslipRows = await adminDb.select().from(schema.payslips).where(inArray(schema.payslips.payrollRunId, [run.id]));
      expect(new Set(payslipRows.map((p) => p.employeeId)).size).toBe(payslipRows.length);
      expect(payslipRows.length).toBeGreaterThanOrEqual(1);

      const finalRuns = await adminDb.select({ status: schema.payrollRuns.status }).from(schema.payrollRuns).where(inArray(schema.payrollRuns.id, [run.id]));
      expect(finalRuns[0]?.status).toBe("completed");
    });
  });

  it("every payroll.* permission referenced by this service exists in the shared PERMISSIONS catalog", () => {
    const payrollPermissions = ALL_PERMISSIONS.filter((p) => p.startsWith("payroll."));
    expect(payrollPermissions).toEqual(
      expect.arrayContaining(["payroll.run", "payroll.view", "payroll.view_all", "payroll.structure.manage"]),
    );
  });
});
