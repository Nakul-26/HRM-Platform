import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { loadEnv, baseEnvSchema } from "@hrm/config";
import { createDbClient, createTenant, schema, type Database } from "@hrm/db";
import { signAccessToken } from "@hrm/auth";
import { PERMISSIONS, type AuthContext, type Permission } from "@hrm/types";
import { app } from "./index";

/**
 * Exercises the full HTTP surface of the performance-service against a real
 * Postgres (RLS included) — same pattern as apps/payroll-service and
 * apps/recruitment-service's integration suites. AuthContext is synthesized
 * directly with `signAccessToken` since every downstream service trusts a
 * pre-resolved, signed context from the Gateway.
 */
describe("performance-service", () => {
  const env = loadEnv(baseEnvSchema);
  const testEnv = {
    APP_DATABASE_URL: env.APP_DATABASE_URL,
    JWT_SIGNING_KEY: env.JWT_SIGNING_KEY,
    JWT_KID: env.JWT_KID,
  };

  let adminDb: Database;
  let tenantA: { id: string };
  let tenantB: { id: string };

  let adminEmployeeA: { id: string };
  let managerEmployeeA: { id: string };
  let reportEmployeeA: { id: string };
  let otherEmployeeA: { id: string };
  let employeeB: { id: string };
  let juniorDesignation: { id: string };
  let seniorDesignation: { id: string };
  let reviewCycleA: { id: string };

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

  async function auditRowCount(action: string, resourceType: string, resourceId: string): Promise<number> {
    const rows = await adminDb
      .select()
      .from(schema.auditLogs)
      .where(
        and(
          eq(schema.auditLogs.tenantId, tenantA.id),
          eq(schema.auditLogs.action, action),
          eq(schema.auditLogs.resourceType, resourceType),
          eq(schema.auditLogs.resourceId, resourceId),
        ),
      );
    return rows.length;
  }

  const ALL_PERMISSIONS = [...PERMISSIONS] as Permission[];

  beforeAll(async () => {
    adminDb = createDbClient(env.DATABASE_URL);
    const suffix = Math.random().toString(36).slice(2, 8);

    tenantA = await createTenant(adminDb, {
      slug: `performance-svc-a-${suffix}`,
      name: "Performance Service Test Tenant A",
      adminEmail: `admin-a-${suffix}@test.local`,
      adminName: "Admin A",
      adminPassword: "Test-Password-123",
    });
    tenantB = await createTenant(adminDb, {
      slug: `performance-svc-b-${suffix}`,
      name: "Performance Service Test Tenant B",
      adminEmail: `admin-b-${suffix}@test.local`,
      adminName: "Admin B",
      adminPassword: "Test-Password-123",
    });

    const [junior] = await adminDb.insert(schema.designations).values({ tenantId: tenantA.id, title: "Engineer I" }).returning();
    const [senior] = await adminDb.insert(schema.designations).values({ tenantId: tenantA.id, title: "Engineer II" }).returning();
    juniorDesignation = junior!;
    seniorDesignation = senior!;

    const [admin] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "PF-ADMIN", firstName: "Ada", lastName: "Admin", employmentType: "full_time", dateOfJoining: "2019-01-01", status: "active" })
      .returning();
    const [manager] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "PF-MGR", firstName: "Mona", lastName: "Manager", employmentType: "full_time", dateOfJoining: "2019-01-01", status: "active" })
      .returning();
    const [report] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "PF-REPORT", firstName: "Rita", lastName: "Report", managerId: manager!.id, designationId: juniorDesignation.id, employmentType: "full_time", dateOfJoining: "2019-06-01", status: "active" })
      .returning();
    const [other] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantA.id, employeeCode: "PF-OTHER", firstName: "Oscar", lastName: "Other", employmentType: "full_time", dateOfJoining: "2019-06-01", status: "active" })
      .returning();
    const [b1] = await adminDb
      .insert(schema.employees)
      .values({ tenantId: tenantB.id, employeeCode: "PF-B-ONE", firstName: "Beatrice", lastName: "One", employmentType: "full_time", dateOfJoining: "2019-06-01", status: "active" })
      .returning();

    adminEmployeeA = admin!;
    managerEmployeeA = manager!;
    reportEmployeeA = report!;
    otherEmployeeA = other!;
    employeeB = b1!;

    const cycleRes = await req(
      "POST",
      "/api/v1/performance/review-cycles",
      authFor({ employeeId: adminEmployeeA.id, permissions: ["performance.review_all"] }),
      { name: "2026 H1", startDate: "2026-01-01", endDate: "2026-06-30" },
    );
    const { data: cycle } = (await cycleRes.json()) as { data: { id: string } };
    reviewCycleA = cycle;
  });

  afterAll(async () => {
    const tenantIds = [tenantA.id, tenantB.id];
    await adminDb.delete(schema.auditLogs).where(inArray(schema.auditLogs.tenantId, tenantIds));
    await adminDb.delete(schema.promotions).where(inArray(schema.promotions.tenantId, tenantIds));
    await adminDb.delete(schema.reviews).where(inArray(schema.reviews.tenantId, tenantIds));
    await adminDb.delete(schema.goals).where(inArray(schema.goals.tenantId, tenantIds));
    await adminDb.delete(schema.reviewCycles).where(inArray(schema.reviewCycles.tenantId, tenantIds));
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
    await adminDb.delete(schema.designations).where(inArray(schema.designations.tenantId, tenantIds));
    await adminDb.delete(schema.tenants).where(inArray(schema.tenants.id, tenantIds));
  });

  describe("review cycles", () => {
    it("is listable by any authenticated employee, but only performance.review_all can create or close", async () => {
      const noPerm = authFor({ employeeId: otherEmployeeA.id, permissions: [] });
      const list = await req("GET", "/api/v1/performance/review-cycles", noPerm);
      expect(list.status).toBe(200);
      const { data } = (await list.json()) as { data: { id: string }[] };
      expect(data.some((c) => c.id === reviewCycleA.id)).toBe(true);

      const rejectedCreate = await req("POST", "/api/v1/performance/review-cycles", noPerm, { name: "Rejected", startDate: "2026-01-01", endDate: "2026-06-30" });
      expect(rejectedCreate.status).toBe(403);

      // reviewCycleA was created via a real POST in beforeAll — confirm it left exactly one audit row.
      expect(await auditRowCount("review_cycle.created", "review_cycle", reviewCycleA.id)).toBe(1);

      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["performance.review_all"] });
      const closed = await req("PATCH", `/api/v1/performance/review-cycles/${reviewCycleA.id}/close`, admin);
      expect(closed.status).toBe(200);

      // Idempotent — closing an already-closed cycle is a no-op, not an error.
      const closedAgain = await req("PATCH", `/api/v1/performance/review-cycles/${reviewCycleA.id}/close`, admin);
      expect(closedAgain.status).toBe(200);
      const { data: reclosed } = (await closedAgain.json()) as { data: { status: string } };
      expect(reclosed.status).toBe("closed");

      // The second close is a no-op and must not produce a duplicate audit row.
      expect(await auditRowCount("review_cycle.closed", "review_cycle", reviewCycleA.id)).toBe(1);
    });
  });

  describe("goals", () => {
    it("lets an employee set their own goal, a manager set a report's goal, but not an unrelated employee", async () => {
      const report = authFor({ employeeId: reportEmployeeA.id, permissions: ["performance.goal.set", "performance.view"] });
      const selfGoal = await req("POST", "/api/v1/performance/goals", report, { employeeId: reportEmployeeA.id, title: "Ship feature X", weight: 40 });
      expect(selfGoal.status).toBe(201);
      const { data: selfGoalData } = (await selfGoal.json()) as { data: { id: string } };
      expect(await auditRowCount("goal.created", "goal", selfGoalData.id)).toBe(1);

      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["performance.review", "performance.view"] });
      const managerSetsReportGoal = await req("POST", "/api/v1/performance/goals", manager, { employeeId: reportEmployeeA.id, title: "Mentor a junior", weight: 20 });
      expect(managerSetsReportGoal.status).toBe(201);

      const stranger = authFor({ employeeId: otherEmployeeA.id, permissions: ["performance.goal.set", "performance.view"] });
      const rejected = await req("POST", "/api/v1/performance/goals", stranger, { employeeId: reportEmployeeA.id, title: "Should be rejected" });
      expect(rejected.status).toBe(403);

      const myGoals = await req("GET", "/api/v1/performance/goals/me", report);
      const { data: mine } = (await myGoals.json()) as { data: { title: string }[] };
      expect(mine.length).toBeGreaterThanOrEqual(2);

      const managerList = await req("GET", "/api/v1/performance/goals", manager);
      const { data: visibleToManager } = (await managerList.json()) as { data: { employeeId: string }[] };
      expect(visibleToManager.every((g) => g.employeeId === managerEmployeeA.id || g.employeeId === reportEmployeeA.id)).toBe(true);
    });
  });

  describe("reviews", () => {
    it("keeps a draft review invisible to the reviewed employee until submitted", async () => {
      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["performance.review", "performance.view"] });
      const created = await req("POST", "/api/v1/performance/reviews", manager, {
        reviewCycleId: reviewCycleA.id,
        employeeId: reportEmployeeA.id,
        rating: 4.5,
        comments: "Solid quarter",
      });
      expect(created.status).toBe(201);
      const { data: review } = (await created.json()) as { data: { id: string; status: string } };
      expect(review.status).toBe("draft");
      expect(await auditRowCount("review.created", "review", review.id)).toBe(1);

      const report = authFor({ employeeId: reportEmployeeA.id, permissions: ["performance.view"] });
      const myReviewsBeforeSubmit = await req("GET", "/api/v1/performance/reviews/me", report);
      const { data: beforeSubmit } = (await myReviewsBeforeSubmit.json()) as { data: { id: string }[] };
      expect(beforeSubmit.some((r) => r.id === review.id)).toBe(false);

      const submitted = await req("PATCH", `/api/v1/performance/reviews/${review.id}/submit`, manager);
      expect(submitted.status).toBe(200);

      const myReviewsAfterSubmit = await req("GET", "/api/v1/performance/reviews/me", report);
      const { data: afterSubmit } = (await myReviewsAfterSubmit.json()) as { data: { id: string; rating: number }[] };
      const mine = afterSubmit.find((r) => r.id === review.id);
      expect(mine).toBeDefined();
      expect(mine?.rating).toBe(4.5);

      // Idempotent — re-submitting an already-submitted review is a no-op.
      const resubmitted = await req("PATCH", `/api/v1/performance/reviews/${review.id}/submit`, manager);
      expect(resubmitted.status).toBe(200);

      // The second submit is a no-op and must not produce a duplicate audit row.
      expect(await auditRowCount("review.submitted", "review", review.id)).toBe(1);
    });

    it("rejects an unrelated employee from creating a review for someone else's report", async () => {
      const stranger = authFor({ employeeId: otherEmployeeA.id, permissions: ["performance.review"] });
      const rejected = await req("POST", "/api/v1/performance/reviews", stranger, { reviewCycleId: reviewCycleA.id, employeeId: reportEmployeeA.id, comments: "Should be rejected" });
      expect(rejected.status).toBe(403);
    });
  });

  describe("promotions", () => {
    it("applies a promotion tied to a review and updates the employee's designation", async () => {
      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["performance.review"] });
      const reviewRes = await req("POST", "/api/v1/performance/reviews", manager, { reviewCycleId: reviewCycleA.id, employeeId: reportEmployeeA.id, rating: 5, comments: "Promotion-worthy" });
      const { data: review } = (await reviewRes.json()) as { data: { id: string } };

      const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["performance.review_all"] });
      const rejected = await req("POST", "/api/v1/performance/promotions", authFor({ employeeId: managerEmployeeA.id, permissions: ["performance.review"] }), {
        employeeId: reportEmployeeA.id,
        reviewId: review.id,
        newDesignationId: seniorDesignation.id,
        effectiveDate: "2026-07-01",
      });
      expect(rejected.status).toBe(403);

      const promoted = await req("POST", "/api/v1/performance/promotions", admin, {
        employeeId: reportEmployeeA.id,
        reviewId: review.id,
        newDesignationId: seniorDesignation.id,
        effectiveDate: "2026-07-01",
      });
      expect(promoted.status).toBe(201);
      const { data: promotion } = (await promoted.json()) as { data: { id: string; previousDesignationId: string | null; newDesignationId: string } };
      expect(promotion.previousDesignationId).toBe(juniorDesignation.id);
      expect(promotion.newDesignationId).toBe(seniorDesignation.id);
      expect(await auditRowCount("promotion.applied", "promotion", promotion.id)).toBe(1);

      const [employeeRow] = await adminDb.select().from(schema.employees).where(inArray(schema.employees.id, [reportEmployeeA.id]));
      expect(employeeRow?.designationId).toBe(seniorDesignation.id);
    });
  });

  describe("reviewable-employees", () => {
    it("scopes the picker to self + direct reports for a manager, and excludes unrelated employees", async () => {
      const manager = authFor({ employeeId: managerEmployeeA.id, permissions: ["performance.view"] });
      const res = await req("GET", "/api/v1/performance/reviewable-employees", manager);
      expect(res.status).toBe(200);
      const { data } = (await res.json()) as { data: { id: string }[] };
      expect(data.some((e) => e.id === reportEmployeeA.id)).toBe(true);
      expect(data.some((e) => e.id === otherEmployeeA.id)).toBe(false);
      expect(data.some((e) => e.id === managerEmployeeA.id)).toBe(false);
    });
  });

  it("is not visible cross-tenant even to a performance.view_all holder of the other tenant", async () => {
    const admin = authFor({ employeeId: adminEmployeeA.id, permissions: ["performance.review"] });
    const created = await req("POST", "/api/v1/performance/goals", admin, { employeeId: adminEmployeeA.id, title: "Cross-tenant isolation check" });
    const { data: goal } = (await created.json()) as { data: { id: string } };
    expect(goal.id).toBeTruthy();

    const otherTenantViewer = authFor({ tenantId: tenantB.id, employeeId: employeeB.id, permissions: ["performance.view_all"] });
    const list = await req("GET", "/api/v1/performance/goals", otherTenantViewer);
    const { data: rows } = (await list.json()) as { data: { id: string }[] };
    expect(rows.some((g) => g.id === goal.id)).toBe(false);
  });

  it("every performance.* permission referenced by this service exists in the shared PERMISSIONS catalog", () => {
    const performancePermissions = ALL_PERMISSIONS.filter((p) => p.startsWith("performance."));
    expect(performancePermissions).toEqual(
      expect.arrayContaining(["performance.review", "performance.review_all", "performance.view", "performance.view_all", "performance.goal.set"]),
    );
  });
});
