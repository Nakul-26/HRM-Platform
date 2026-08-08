import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { loadEnv, baseEnvSchema } from "@hrm/config";
import { createDbClient, withTenant, type Database } from "./client";
import { createTenant } from "./onboarding";
import { departments, rolePermissions, roles, tenants } from "./schema/index";

/**
 * The blocking Phase 0 test (docs/architecture/10-roadmap.md): proves tenant
 * A's queries return zero rows of tenant B's data under RLS, not just that
 * same-tenant reads work. Requires a running Postgres with migrations +
 * enable-rls.sql already applied (see infra/docker-compose.yml and
 * `pnpm db:migrate`).
 *
 * adminDb (DATABASE_URL) bypasses RLS by design and is used only to seed and
 * tear down fixtures. appDb (APP_DATABASE_URL, the `hrm_app` role) is what's
 * actually under test — services connect this way in production.
 */
describe("row-level security: cross-tenant isolation", () => {
  const env = loadEnv(baseEnvSchema);
  let adminDb: Database;
  let appDb: Database;
  let tenantA: { id: string };
  let tenantB: { id: string };
  let deptAId: string;
  let deptBId: string;

  beforeAll(async () => {
    adminDb = createDbClient(env.DATABASE_URL);
    appDb = createDbClient(env.APP_DATABASE_URL);

    const suffix = Math.random().toString(36).slice(2, 8);
    tenantA = await createTenant(adminDb, {
      slug: `rls-test-a-${suffix}`,
      name: "RLS Test Tenant A",
      adminEmail: `admin-a-${suffix}@test.local`,
      adminName: "Admin A",
    });
    tenantB = await createTenant(adminDb, {
      slug: `rls-test-b-${suffix}`,
      name: "RLS Test Tenant B",
      adminEmail: `admin-b-${suffix}@test.local`,
      adminName: "Admin B",
    });

    const [deptA] = await adminDb
      .insert(departments)
      .values({ tenantId: tenantA.id, name: "Engineering (A)" })
      .returning();
    const [deptB] = await adminDb
      .insert(departments)
      .values({ tenantId: tenantB.id, name: "Engineering (B)" })
      .returning();
    if (!deptA || !deptB) throw new Error("fixture setup failed");
    deptAId = deptA.id;
    deptBId = deptB.id;
  });

  afterAll(async () => {
    const tenantIds = [tenantA.id, tenantB.id];
    await adminDb.delete(departments).where(inArray(departments.tenantId, tenantIds));
    await adminDb.delete(rolePermissions).where(
      inArray(
        rolePermissions.roleId,
        adminDb.select({ id: roles.id }).from(roles).where(inArray(roles.tenantId, tenantIds)),
      ),
    );
    await adminDb.delete(roles).where(inArray(roles.tenantId, tenantIds));
    await adminDb.delete(tenants).where(inArray(tenants.id, tenantIds));
  });

  it("returns only tenant A's rows when scoped to tenant A", async () => {
    const rows = await withTenant(appDb, tenantA.id, (tx) => tx.select().from(departments));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(deptAId);
    expect(ids).not.toContain(deptBId);
    expect(rows.every((r) => r.tenantId === tenantA.id)).toBe(true);
  });

  it("returns only tenant B's rows when scoped to tenant B", async () => {
    const rows = await withTenant(appDb, tenantB.id, (tx) => tx.select().from(departments));
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(deptBId);
    expect(ids).not.toContain(deptAId);
  });

  it("returns zero rows when no tenant context is set (safe default deny)", async () => {
    const rows = await appDb.select().from(departments);
    expect(rows).toHaveLength(0);
  });

  it("cannot read the other tenant's row even by primary key", async () => {
    const rows = await withTenant(appDb, tenantA.id, (tx) =>
      tx.select().from(departments).where(eq(departments.id, deptBId)),
    );
    expect(rows).toHaveLength(0);
  });

  it("rejects an insert into another tenant while scoped to tenant A", async () => {
    await expect(
      withTenant(appDb, tenantA.id, (tx) =>
        tx.insert(departments).values({ tenantId: tenantB.id, name: "Should be rejected" }),
      ),
    ).rejects.toThrow();
  });
});
