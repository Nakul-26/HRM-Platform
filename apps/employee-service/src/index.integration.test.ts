import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inArray } from "drizzle-orm";
import { loadEnv, baseEnvSchema } from "@hrm/config";
import { createDbClient, createTenant, schema, type Database } from "@hrm/db";
import { signAccessToken } from "@hrm/auth";
import { PERMISSIONS, type AuthContext, type Permission } from "@hrm/types";
import app from "./index";

/**
 * Exercises the full HTTP surface of the employee-service against a real
 * Postgres (RLS included), not mocks — same bar as packages/db's Phase 0
 * RLS test (docs/architecture/10-roadmap.md). AuthContext is synthesized
 * directly with `signAccessToken` rather than going through Identity: the
 * architecture deliberately makes every downstream service trust a
 * pre-resolved, signed context (docs/architecture/06-security.md), so this
 * is exactly what a real request looks like once it reaches this service.
 */
describe("employee-service", () => {
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
      slug: `emp-svc-a-${suffix}`,
      name: "Employee Service Test Tenant A",
      adminEmail: `admin-a-${suffix}@test.local`,
      adminName: "Admin A",
      adminPassword: "Test-Password-123",
    });
    tenantB = await createTenant(adminDb, {
      slug: `emp-svc-b-${suffix}`,
      name: "Employee Service Test Tenant B",
      adminEmail: `admin-b-${suffix}@test.local`,
      adminName: "Admin B",
      adminPassword: "Test-Password-123",
    });

    const [admin] = await adminDb
      .insert(schema.employees)
      .values({
        tenantId: tenantA.id,
        employeeCode: "A-ADMIN",
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
        employeeCode: "A-MGR",
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
        employeeCode: "A-REPORT",
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
        employeeCode: "A-OTHER",
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
        employeeCode: "B-ONE",
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
  });

  afterAll(async () => {
    const tenantIds = [tenantA.id, tenantB.id];
    await adminDb.delete(schema.payrollTaxConfig).where(inArray(schema.payrollTaxConfig.tenantId, tenantIds));
    await adminDb.delete(schema.employeeDocuments).where(inArray(schema.employeeDocuments.tenantId, tenantIds));
    await adminDb.delete(schema.employees).where(inArray(schema.employees.tenantId, tenantIds));
    await adminDb.delete(schema.accounts).where(inArray(schema.accounts.tenantId, tenantIds));
    await adminDb.delete(schema.users).where(inArray(schema.users.tenantId, tenantIds));
    await adminDb.delete(schema.departments).where(inArray(schema.departments.tenantId, tenantIds));
    await adminDb.delete(schema.branches).where(inArray(schema.branches.tenantId, tenantIds));
    await adminDb.delete(schema.designations).where(inArray(schema.designations.tenantId, tenantIds));
    await adminDb.delete(schema.rolePermissions).where(
      inArray(
        schema.rolePermissions.roleId,
        adminDb.select({ id: schema.roles.id }).from(schema.roles).where(inArray(schema.roles.tenantId, tenantIds)),
      ),
    );
    await adminDb.delete(schema.roles).where(inArray(schema.roles.tenantId, tenantIds));
    await adminDb.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
  });

  describe("departments", () => {
    it("requires department.manage to create, and rejects everyone else", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["department.manage"] });
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: ["employee.read"] });

      const created = await req("POST", "/api/v1/departments", admin, { name: "Engineering" });
      expect(created.status).toBe(201);

      const rejected = await req("POST", "/api/v1/departments", noPerm, { name: "Sales" });
      expect(rejected.status).toBe(403);
    });

    it("only lists the caller's own tenant's departments", async () => {
      const adminA = authFor({ employeeId: adminEmployeeA.id, permissions: ["department.manage", "employee.read"] });
      const adminB = authFor({
        tenantId: tenantB.id,
        employeeId: employeeB.id,
        permissions: ["department.manage", "employee.read"],
      });
      await req("POST", "/api/v1/departments", adminB, { name: "Tenant B Only Dept" });

      const listA = await req("GET", "/api/v1/departments", adminA);
      const bodyA = (await listA.json()) as { data: { name: string }[] };
      expect(bodyA.data.some((d) => d.name === "Tenant B Only Dept")).toBe(false);
    });

    it("supports patch and soft-delete, and 404s on a re-fetch after delete", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["department.manage"] });
      const created = await req("POST", "/api/v1/departments", admin, { name: "Temp Dept" });
      const { data: dept } = (await created.json()) as { data: { id: string } };

      const patched = await req("PATCH", `/api/v1/departments/${dept.id}`, admin, { name: "Renamed Dept" });
      expect(patched.status).toBe(200);

      const deleted = await req("DELETE", `/api/v1/departments/${dept.id}`, admin);
      expect(deleted.status).toBe(204);

      const refetched = await req("GET", `/api/v1/departments/${dept.id}`, admin);
      expect(refetched.status).toBe(404);
    });
  });

  describe("employees: CRUD + RBAC", () => {
    it("creates an employee only with employee.write_all, and rejects a duplicate employee_code", async () => {
      const writer = authFor({ employeeId: adminEmployeeA.id, permissions: ["employee.write_all", "employee.read_all"] });
      const nonWriter = authFor({ employeeId: adminEmployeeA.id, permissions: ["employee.write"] });

      const rejected = await req("POST", "/api/v1/employees", nonWriter, {
        employeeCode: "NEW1",
        firstName: "New",
        lastName: "Hire",
        employmentType: "full_time",
        dateOfJoining: "2024-01-01",
      });
      expect(rejected.status).toBe(403);

      const created = await req("POST", "/api/v1/employees", writer, {
        employeeCode: "NEW1",
        firstName: "New",
        lastName: "Hire",
        employmentType: "full_time",
        dateOfJoining: "2024-01-01",
      });
      expect(created.status).toBe(201);

      const duplicate = await req("POST", "/api/v1/employees", writer, {
        employeeCode: "NEW1",
        firstName: "Another",
        lastName: "Person",
        employmentType: "full_time",
        dateOfJoining: "2024-01-01",
      });
      expect(duplicate.status).toBe(409);
      const duplicateBody = (await duplicate.json()) as { error: { code: string } };
      expect(duplicateBody.error.code).toBe("EMPLOYEE_CODE_CONFLICT");
    });

    it("scopes the list endpoint to self+direct-reports without the _all permission", async () => {
      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["employee.read"] });
      const res = await req("GET", "/api/v1/employees?pageSize=100", manager);
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as { data: { id: string }[] };
      const ids = data.map((e) => e.id);
      expect(ids).toContain(managerEmployeeA.id);
      expect(ids).toContain(reportEmployeeA.id);
      expect(ids).not.toContain(otherEmployeeA.id);
    });

    it("read_all sees every employee in the tenant, including non-reports", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["employee.read_all"] });
      const res = await req("GET", "/api/v1/employees?pageSize=100", admin);
      const { data } = (await res.json()) as { data: { id: string }[] };
      const ids = data.map((e) => e.id);
      expect(ids).toContain(otherEmployeeA.id);
    });

    it("get-by-id: self and manager-of-direct-report are allowed, unrelated peers are forbidden", async () => {
      const asSelf = authFor({ employeeId: reportEmployeeA.id, permissions: ["employee.read"] });
      const asManager = authFor({ employeeId: managerEmployeeA.id, permissions: ["employee.read"] });
      const asPeer = authFor({ employeeId: otherEmployeeA.id, permissions: ["employee.read"] });

      expect((await req("GET", `/api/v1/employees/${reportEmployeeA.id}`, asSelf)).status).toBe(200);
      expect((await req("GET", `/api/v1/employees/${reportEmployeeA.id}`, asManager)).status).toBe(200);
      expect((await req("GET", `/api/v1/employees/${reportEmployeeA.id}`, asPeer)).status).toBe(403);
    });

    it("cross-tenant: an admin's read_all token for tenant B cannot see tenant A's employee, even by exact id (RLS, not just app logic)", async () => {
      const tenantBAdmin = authFor({ tenantId: tenantB.id, employeeId: employeeB.id, permissions: ["employee.read_all"] });
      const res = await req("GET", `/api/v1/employees/${adminEmployeeA.id}`, tenantBAdmin);
      expect(res.status).toBe(404);
    });

    it("PATCH /:id requires employee.write_all — a plain employee.write holder is rejected even on their own record", async () => {
      const self = authFor({ employeeId: reportEmployeeA.id, permissions: ["employee.write"] });
      const res = await req("PATCH", `/api/v1/employees/${reportEmployeeA.id}`, self, { phone: "555-0100" });
      expect(res.status).toBe(403);
    });

    it("PATCH /me lets an employee edit their own contact fields but silently drops disallowed fields like employeeCode", async () => {
      const self = authFor({ employeeId: reportEmployeeA.id, permissions: ["employee.write"] });
      const res = await req("PATCH", "/api/v1/employees/me", self, {
        phone: "555-0199",
        employeeCode: "HACKED",
      });
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as { data: { phone: string; employeeCode: string } };
      expect(data.phone).toBe("555-0199");
      expect(data.employeeCode).toBe("A-REPORT");
    });

    it("PATCH /me is forbidden without employee.write", async () => {
      const self = authFor({ employeeId: reportEmployeeA.id, permissions: ["employee.read"] });
      const res = await req("PATCH", "/api/v1/employees/me", self, { phone: "555-0199" });
      expect(res.status).toBe(403);
    });

    it("terminate (DELETE) requires employee.terminate and is idempotent-safe (409 on re-terminate)", async () => {
      const [target] = await adminDb
        .insert(schema.employees)
        .values({
          tenantId: tenantA.id,
          employeeCode: "TERM1",
          firstName: "To",
          lastName: "Terminate",
          employmentType: "full_time",
          dateOfJoining: "2022-01-01",
          status: "active",
        })
        .returning();

      const noPerm = authFor({ employeeId: adminEmployeeA.id, permissions: ["employee.read_all"] });
      const withPerm = authFor({ employeeId: adminEmployeeA.id, permissions: ["employee.terminate"] });

      expect((await req("DELETE", `/api/v1/employees/${target!.id}`, noPerm)).status).toBe(403);

      const first = await req("DELETE", `/api/v1/employees/${target!.id}`, withPerm);
      expect(first.status).toBe(200);
      const firstBody = (await first.json()) as { data: { status: string } };
      expect(firstBody.data.status).toBe("terminated");

      const second = await req("DELETE", `/api/v1/employees/${target!.id}`, withPerm);
      expect(second.status).toBe(409);
    });
  });

  describe("org directory", () => {
    it("returns non-sensitive fields only, available to any authenticated employee", async () => {
      const anyEmployee = authFor({ employeeId: reportEmployeeA.id, permissions: ["employee.read"] });
      const res = await req("GET", "/api/v1/employees/directory?pageSize=100", anyEmployee);
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as { data: Record<string, unknown>[] };
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).not.toHaveProperty("personalEmail");
      expect(data[0]).toHaveProperty("workEmail");
    });
  });

  describe("employee documents", () => {
    it("self can attach and list their own document metadata; an unrelated peer cannot", async () => {
      const self = authFor({ employeeId: otherEmployeeA.id, permissions: ["employee.write", "employee.read"] });
      const peer = authFor({ employeeId: reportEmployeeA.id, permissions: ["employee.write", "employee.read"] });

      const created = await req("POST", `/api/v1/employees/${otherEmployeeA.id}/documents`, self, {
        documentType: "id_proof",
        objectKey: `tenants/${tenantA.id}/employees/${otherEmployeeA.id}/some-file.pdf`,
      });
      expect(created.status).toBe(201);

      const deniedCreate = await req("POST", `/api/v1/employees/${otherEmployeeA.id}/documents`, peer, {
        documentType: "id_proof",
        objectKey: "irrelevant",
      });
      expect(deniedCreate.status).toBe(403);

      const list = await req("GET", `/api/v1/employees/${otherEmployeeA.id}/documents`, self);
      expect(list.status).toBe(200);
      const { data } = (await list.json()) as { data: unknown[] };
      expect(data).toHaveLength(1);

      const deniedList = await req("GET", `/api/v1/employees/${otherEmployeeA.id}/documents`, peer);
      expect(deniedList.status).toBe(403);
    });
  });

  describe("CSV bulk import", () => {
    it("requires employee.write_all", async () => {
      const nonWriter = authFor({ employeeId: adminEmployeeA.id, permissions: ["employee.read_all"] });
      const res = await app.request(
        "/api/v1/employees/import",
        { method: "POST", headers: { authorization: await bearer(nonWriter) }, body: "employee_code\n" },
        testEnv,
      );
      expect(res.status).toBe(403);
    });

    it("imports a batch end-to-end: creates a new department by name and links a manager reference within the same file", async () => {
      const writer = authFor({ employeeId: adminEmployeeA.id, permissions: ["employee.write_all", "employee.read_all"] });
      const csv = [
        "employee_code,first_name,last_name,personal_email,work_email,phone,department_name,designation_title,branch_name,manager_employee_code,employment_type,date_of_joining",
        "IMP-MGR,Ivy,Importmgr,,,,Imported Dept,,,,full_time,2024-01-01",
        "IMP-REPORT,Ike,Importreport,,,,Imported Dept,,,IMP-MGR,full_time,2024-01-02",
      ].join("\n");

      const res = await app.request(
        "/api/v1/employees/import",
        { method: "POST", headers: { authorization: await bearer(writer) }, body: csv },
        testEnv,
      );
      expect(res.status).toBe(201);
      const body = (await res.json()) as { data: { imported: number } };
      expect(body.data.imported).toBe(2);

      const deptRes = await req("GET", "/api/v1/departments?pageSize=100", writer);
      const { data: depts } = (await deptRes.json()) as { data: { name: string }[] };
      expect(depts.some((d) => d.name === "Imported Dept")).toBe(true);

      const listRes = await req("GET", "/api/v1/employees?pageSize=100", writer);
      const { data: allEmployees } = (await listRes.json()) as {
        data: { id: string; employeeCode: string; managerId: string | null }[];
      };
      const mgr = allEmployees.find((e) => e.employeeCode === "IMP-MGR");
      const report = allEmployees.find((e) => e.employeeCode === "IMP-REPORT");
      expect(mgr).toBeDefined();
      expect(report?.managerId).toBe(mgr?.id);
    });

    it("is all-or-nothing: a duplicate employee_code against an existing row rejects the whole batch", async () => {
      const writer = authFor({ employeeId: adminEmployeeA.id, permissions: ["employee.write_all", "employee.read_all"] });
      const beforeRes = await req("GET", "/api/v1/employees?pageSize=200", writer);
      const before = ((await beforeRes.json()) as { data: unknown[] }).data.length;

      const csv = [
        "employee_code,first_name,last_name,personal_email,work_email,phone,department_name,designation_title,branch_name,manager_employee_code,employment_type,date_of_joining",
        "A-ADMIN,Duplicate,Row,,,,,,,,full_time,2024-01-01",
        "BATCH-NEW,Fresh,Row,,,,,,,,full_time,2024-01-01",
      ].join("\n");

      const res = await app.request(
        "/api/v1/employees/import",
        { method: "POST", headers: { authorization: await bearer(writer) }, body: csv },
        testEnv,
      );
      expect(res.status).toBe(422);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("CSV_VALIDATION_FAILED");

      const afterRes = await req("GET", "/api/v1/employees?pageSize=200", writer);
      const after = ((await afterRes.json()) as { data: unknown[] }).data.length;
      expect(after).toBe(before); // BATCH-NEW must not have been inserted despite being a valid row
    });
  });

  it("sanity: the admin role's full permission set can reach every RBAC-gated endpoint used above", () => {
    // Guards against silently renaming a permission string in one place
    // (route handler) but not the other (packages/types/src/permissions.ts).
    expect(ALL_PERMISSIONS).toEqual(expect.arrayContaining([
      "employee.read",
      "employee.read_all",
      "employee.write",
      "employee.write_all",
      "employee.terminate",
      "department.manage",
    ]));
  });
});
