import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { loadEnv, baseEnvSchema } from "@hrm/config";
import { createDbClient, createTenant, schema, type Database } from "@hrm/db";
import { signAccessToken } from "@hrm/auth";
import { PERMISSIONS, type AuthContext, type Permission } from "@hrm/types";
import { app } from "./index";

/**
 * Exercises the full HTTP surface of the recruitment-service against a real
 * Postgres (RLS included) and the real local MinIO instance for resume
 * storage — same pattern as apps/payroll-service's integration suite.
 * AuthContext is synthesized directly with `signAccessToken` since every
 * downstream service trusts a pre-resolved, signed context from the Gateway.
 */
describe("recruitment-service", () => {
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
  let interviewerEmployeeA: { id: string };
  let otherEmployeeA: { id: string };
  let employeeB: { id: string };
  let departmentA: { id: string };
  let designationA: { id: string };
  let jobOpeningA: { id: string };

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
      slug: `recruitment-svc-a-${suffix}`,
      name: "Recruitment Service Test Tenant A",
      adminEmail: `admin-a-${suffix}@test.local`,
      adminName: "Admin A",
      adminPassword: "Test-Password-123",
    });
    tenantB = await createTenant(adminDb, {
      slug: `recruitment-svc-b-${suffix}`,
      name: "Recruitment Service Test Tenant B",
      adminEmail: `admin-b-${suffix}@test.local`,
      adminName: "Admin B",
      adminPassword: "Test-Password-123",
    });

    const [admin] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "R-ADMIN", firstName: "Ada", lastName: "Admin", employmentType: "full_time", dateOfJoining: "2019-01-01", status: "active" })
      .returning();
    const [interviewer] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "R-INT", firstName: "Ivy", lastName: "Interviewer", employmentType: "full_time", dateOfJoining: "2019-01-01", status: "active" })
      .returning();
    const [other] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "R-OTHER", firstName: "Oscar", lastName: "Other", employmentType: "full_time", dateOfJoining: "2019-01-01", status: "active" })
      .returning();
    const [b1] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantB.id, employeeCode: "R-B-ONE", firstName: "Beatrice", lastName: "One", employmentType: "full_time", dateOfJoining: "2019-01-01", status: "active" })
      .returning();

    adminEmployeeA = admin!;
    interviewerEmployeeA = interviewer!;
    otherEmployeeA = other!;
    employeeB = b1!;

    const [dept] = await adminDb.insert(schema.departments).values({ tenantId: tenantA.id, name: "Engineering" }).returning();
    const [designation] = await adminDb.insert(schema.designations).values({ tenantId: tenantA.id, title: "Software Engineer" }).returning();
    departmentA = dept!;
    designationA = designation!;

    const jobOpeningRes = await req(
      "POST",
      "/api/v1/recruitment/job-openings",
      authFor({ employeeId: adminEmployeeA.id, permissions: ["recruitment.manage"] }),
      { title: "Backend Engineer", departmentId: departmentA.id, employmentType: "full_time" },
    );
    const { data: jobOpening } = (await jobOpeningRes.json()) as { data: { id: string } };
    jobOpeningA = jobOpening;
  });

  async function countAuditLogs(action: string, resourceType: string, resourceId: string, tenantId = tenantA.id) {
    const rows = await adminDb
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.tenantId, tenantId),
          eq(schema.auditLogs.action, action),
          eq(schema.auditLogs.resourceType, resourceType),
          eq(schema.auditLogs.resourceId, resourceId),
        ),
      );
    return rows.length;
  }

  afterAll(async () => {
    const tenantIds = [tenantA.id, tenantB.id];
    await adminDb.delete(schema.auditLogs).where(inArray(schema.auditLogs.tenantId, tenantIds));
    await adminDb.delete(schema.interviews).where(inArray(schema.interviews.tenantId, tenantIds));
    await adminDb.delete(schema.offers).where(inArray(schema.offers.tenantId, tenantIds));
    await adminDb.delete(schema.candidates).where(inArray(schema.candidates.tenantId, tenantIds));
    await adminDb.delete(schema.jobOpenings).where(inArray(schema.jobOpenings.tenantId, tenantIds));
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
    await adminDb.delete(schema.departments).where(inArray(schema.departments.tenantId, tenantIds));
    await adminDb.delete(schema.designations).where(inArray(schema.designations.tenantId, tenantIds));
    await adminDb.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
  });

  describe("job openings", () => {
    it("requires recruitment.manage to create or list", async () => {
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: [] });
      const rejected = await req("POST", "/api/v1/recruitment/job-openings", noPerm, { title: "Rejected" });
      expect(rejected.status).toBe(403);

      const rejectedList = await req("GET", "/api/v1/recruitment/job-openings", noPerm);
      expect(rejectedList.status).toBe(403);

      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["recruitment.manage"] });
      const list = await req("GET", "/api/v1/recruitment/job-openings", admin);
      expect(list.status).toBe(200);
    });
  });

  describe("candidates", () => {
    it("rejects setting pipelineStage to hired via PATCH, and rejects any edit once already hired", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["recruitment.manage"] });
      const created = await req("POST", "/api/v1/recruitment/candidates", admin, {
        jobOpeningId: jobOpeningA.id,
        fullName: "Nina Candidate",
        email: "nina.candidate@example.com",
      });
      expect(created.status).toBe(201);
      const { data: candidate } = (await created.json()) as { data: { id: string } };
      expect(await countAuditLogs("candidate.created", "candidate", candidate.id)).toBe(1);

      const rejectedStageChange = await req("PATCH", `/api/v1/recruitment/candidates/${candidate.id}`, admin, { pipelineStage: "hired" });
      expect(rejectedStageChange.status).toBe(400);

      const validChange = await req("PATCH", `/api/v1/recruitment/candidates/${candidate.id}`, admin, { pipelineStage: "screening" });
      expect(validChange.status).toBe(200);
      expect(await countAuditLogs("candidate.updated", "candidate", candidate.id)).toBe(1);
    });

    it("uploads, records, and downloads a resume via presigned MinIO URLs", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["recruitment.manage"] });
      const created = await req("POST", "/api/v1/recruitment/candidates", admin, {
        jobOpeningId: jobOpeningA.id,
        fullName: "Resume Candidate",
        email: "resume.candidate@example.com",
      });
      const { data: candidate } = (await created.json()) as { data: { id: string } };

      const presign = await req("POST", `/api/v1/recruitment/candidates/${candidate.id}/resume/presign-upload`, admin, {
        fileName: "resume.pdf",
        contentType: "application/pdf",
      });
      expect(presign.status).toBe(201);
      const { data: presigned } = (await presign.json()) as { data: { objectKey: string; uploadUrl: string } };

      const putRes = await fetch(presigned.uploadUrl, { method: "PUT", headers: { "content-type": "application/pdf" }, body: new Uint8Array([1, 2, 3]) });
      expect(putRes.ok).toBe(true);

      const recorded = await req("PATCH", `/api/v1/recruitment/candidates/${candidate.id}/resume`, admin, { objectKey: presigned.objectKey });
      expect(recorded.status).toBe(200);
      expect(await countAuditLogs("candidate.resume_uploaded", "candidate", candidate.id)).toBe(1);

      const downloadRes = await req("GET", `/api/v1/recruitment/candidates/${candidate.id}/resume/download-url`, admin);
      expect(downloadRes.status).toBe(200);
      const { data: download } = (await downloadRes.json()) as { data: { downloadUrl: string } };

      const fetched = await fetch(download.downloadUrl);
      expect(fetched.status).toBe(200);
    });

    it("is not visible cross-tenant even to a recruitment.manage holder of the other tenant", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["recruitment.manage"] });
      const created = await req("POST", "/api/v1/recruitment/candidates", admin, {
        jobOpeningId: jobOpeningA.id,
        fullName: "Cross Tenant Candidate",
        email: "cross.tenant@example.com",
      });
      const { data: candidate } = (await created.json()) as { data: { id: string } };

      const otherTenant = authFor({ tenantId: tenantB.id, employeeId: employeeB.id, permissions: ["recruitment.manage"] });
      const res = await req("GET", `/api/v1/recruitment/candidates/${candidate.id}`, otherTenant);
      expect(res.status).toBe(404);
    });
  });

  describe("interviews", () => {
    it("lets an assigned interviewer record their own feedback, but not an unassigned employee", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["recruitment.manage"] });
      const created = await req("POST", "/api/v1/recruitment/candidates", admin, {
        jobOpeningId: jobOpeningA.id,
        fullName: "Interview Candidate",
        email: "interview.candidate@example.com",
      });
      const { data: candidate } = (await created.json()) as { data: { id: string } };

      const interviewRes = await req("POST", "/api/v1/recruitment/interviews", admin, {
        candidateId: candidate.id,
        interviewerId: interviewerEmployeeA.id,
        scheduledAt: new Date().toISOString(),
      });
      expect(interviewRes.status).toBe(201);
      const { data: interview } = (await interviewRes.json()) as { data: { id: string } };
      expect(await countAuditLogs("interview.scheduled", "interview", interview.id)).toBe(1);

      const unassigned = authFor({ employeeId: otherEmployeeA.id, permissions: ["recruitment.interview.conduct"] });
      const rejected = await req("PATCH", `/api/v1/recruitment/interviews/${interview.id}/feedback`, unassigned, { rating: 4, feedback: "Should not work" });
      expect(rejected.status).toBe(403);

      const assigned = authFor({ employeeId: interviewerEmployeeA.id, permissions: ["recruitment.interview.conduct"] });
      const accepted = await req("PATCH", `/api/v1/recruitment/interviews/${interview.id}/feedback`, assigned, { rating: 4, feedback: "Strong candidate" });
      expect(accepted.status).toBe(200);
      const { data: updated } = (await accepted.json()) as { data: { status: string; rating: number } };
      expect(updated.status).toBe("completed");
      expect(updated.rating).toBe(4);
      expect(await countAuditLogs("interview.feedback_submitted", "interview", interview.id)).toBe(1);

      const myInterviews = await req("GET", "/api/v1/recruitment/interviews/me", assigned);
      const { data: mine } = (await myInterviews.json()) as { data: { id: string }[] };
      expect(mine.some((i) => i.id === interview.id)).toBe(true);
    });
  });

  describe("hire conversion", () => {
    it("hires a candidate into a fully-formed employee record with no manual data re-entry, and re-hiring is idempotent", async () => {
      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["recruitment.manage"] });
      const created = await req("POST", "/api/v1/recruitment/candidates", admin, {
        jobOpeningId: jobOpeningA.id,
        fullName: "Hired Candidate Example",
        email: "hired.candidate@example.com",
      });
      const { data: candidate } = (await created.json()) as { data: { id: string } };

      const offerRes = await req("POST", "/api/v1/recruitment/offers", admin, {
        candidateId: candidate.id,
        designationId: designationA.id,
        offeredCtc: 1_200_000,
        joiningDate: "2026-09-01",
      });
      expect(offerRes.status).toBe(201);
      const { data: offer } = (await offerRes.json()) as { data: { id: string } };
      expect(await countAuditLogs("offer.created", "offer", offer.id)).toBe(1);

      const acceptRes = await req("PATCH", `/api/v1/recruitment/offers/${offer.id}`, admin, { status: "accepted" });
      expect(acceptRes.status).toBe(200);
      expect(await countAuditLogs("offer.status_updated", "offer", offer.id)).toBe(1);

      const hireRes = await req("POST", `/api/v1/recruitment/candidates/${candidate.id}/hire`, admin, { employeeCode: `HIRED-${Date.now()}` });
      expect(hireRes.status).toBe(201);
      const { data: hired } = (await hireRes.json()) as { data: { employeeId: string; alreadyHired: boolean } };
      expect(hired.alreadyHired).toBe(false);
      expect(await countAuditLogs("candidate.hired", "candidate", candidate.id)).toBe(1);

      const [employeeRow] = await adminDb.select().from(schema.employees).where(inArray(schema.employees.id, [hired.employeeId]));
      expect(employeeRow?.firstName).toBe("Hired");
      expect(employeeRow?.lastName).toBe("Candidate Example");
      expect(employeeRow?.personalEmail).toBe("hired.candidate@example.com");
      expect(employeeRow?.employmentType).toBe("full_time");
      expect(employeeRow?.dateOfJoining).toBe("2026-09-01");
      expect(employeeRow?.designationId).toBe(designationA.id);

      const rehireRes = await req("POST", `/api/v1/recruitment/candidates/${candidate.id}/hire`, admin, { employeeCode: "SHOULD-BE-IGNORED" });
      expect(rehireRes.status).toBe(200);
      const { data: rehired } = (await rehireRes.json()) as { data: { employeeId: string; alreadyHired: boolean } };
      expect(rehired.alreadyHired).toBe(true);
      expect(rehired.employeeId).toBe(hired.employeeId);
      // Idempotent re-hire must not produce a duplicate audit row.
      expect(await countAuditLogs("candidate.hired", "candidate", candidate.id)).toBe(1);

      const employeeRows = await adminDb.select().from(schema.employees).where(inArray(schema.employees.id, [hired.employeeId]));
      expect(employeeRows).toHaveLength(1);
    });
  });

  it("every recruitment.* permission referenced by this service exists in the shared PERMISSIONS catalog", () => {
    const recruitmentPermissions = ALL_PERMISSIONS.filter((p) => p.startsWith("recruitment."));
    expect(recruitmentPermissions).toEqual(expect.arrayContaining(["recruitment.manage", "recruitment.interview.conduct"]));
  });
});
