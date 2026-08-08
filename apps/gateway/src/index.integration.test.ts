import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { loadEnv, baseEnvSchema } from "@hrm/config";
import { createDbClient, schema, type Database } from "@hrm/db";
import { verifyAccessToken } from "@hrm/auth";
import app from "./index";

/**
 * Exercises the Gateway's own new surface against real Postgres: org signup
 * (creates a tenant + logs the admin in), login (verifies a real Better
 * Auth-hashed password), and proxying to a downstream service (mocked
 * fetch — this suite doesn't stand up a real employee-service). Tenant
 * resolution + jwtAuth are covered at the unit level in index.test.ts; this
 * file is what proves the new auth routes actually work end to end.
 */
describe("gateway: signup, login, proxying", () => {
  const env = loadEnv(baseEnvSchema);
  const ROOT_DOMAIN = "lvh.me";
  const testEnv = {
    ROOT_DOMAIN,
    APP_DATABASE_URL: env.APP_DATABASE_URL,
    JWT_SIGNING_KEY: env.JWT_SIGNING_KEY,
    JWT_KID: env.JWT_KID,
    EMPLOYEE_SERVICE_URL: "http://employee-service.test",
    DOCUMENT_SERVICE_URL: "http://document-service.test",
  };

  let adminDb: Database;
  const createdSlugs: string[] = [];

  function slug(prefix: string) {
    const s = `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
    createdSlugs.push(s);
    return s;
  }

  async function signup(body: Record<string, unknown>) {
    return app.request(
      "/api/v1/auth/signup",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
      testEnv,
    );
  }

  async function login(host: string, body: Record<string, unknown>) {
    return app.request(
      "/api/v1/auth/login",
      { method: "POST", headers: { "content-type": "application/json", host }, body: JSON.stringify(body) },
      testEnv,
    );
  }

  beforeAll(() => {
    adminDb = createDbClient(env.DATABASE_URL);
  });

  afterAll(async () => {
    if (createdSlugs.length === 0) return;
    const tenants = await adminDb
      .select()
      .from(schema.tenants)
      .where(inArray(schema.tenants.subdomain, createdSlugs));
    const tenantIds = tenants.map((t) => t.id);
    if (tenantIds.length === 0) return;

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

  it("signup creates a tenant, admin user, and returns a working token", async () => {
    const s = slug("acme");
    const res = await signup({
      slug: s,
      name: "Acme Inc",
      adminEmail: `admin@${s}.test`,
      adminName: "Ada Admin",
      adminPassword: "correct-horse-battery-staple",
    });
    expect(res.status).toBe(201);

    const body = (await res.json()) as { data: { tenant: { id: string; slug: string }; token: string } };
    expect(body.data.tenant.slug).toBe(s);
    expect(typeof body.data.token).toBe("string");

    const auth = await verifyAccessToken(body.data.token, { signingKey: env.JWT_SIGNING_KEY, kid: env.JWT_KID });
    expect(auth.tenantId).toBe(body.data.tenant.id);
    expect(auth.roleName).toBe("admin");
    expect(auth.permissions).toContain("employee.write_all");
    expect(auth.employeeId).not.toBeNull();
  });

  it("rejects signup with an already-taken slug", async () => {
    const s = slug("dupe");
    const payload = {
      slug: s,
      name: "Dupe Inc",
      adminEmail: `admin@${s}.test`,
      adminName: "Admin",
      adminPassword: "correct-horse-battery-staple",
    };
    const first = await signup(payload);
    expect(first.status).toBe(201);

    const second = await signup({ ...payload, adminEmail: `other@${s}.test` });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { error: { code: string } };
    expect(body.error.code).toBe("TENANT_SLUG_TAKEN");
  });

  it("logs the admin in with the correct password and rejects a wrong one", async () => {
    const s = slug("globex");
    const email = `admin@${s}.test`;
    await signup({ slug: s, name: "Globex", adminEmail: email, adminName: "Hank Admin", adminPassword: "hunter2-hunter2" });

    const good = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "hunter2-hunter2" });
    expect(good.status).toBe(200);
    const goodBody = (await good.json()) as { data: { token: string; auth: { roleName: string } } };
    expect(goodBody.data.auth.roleName).toBe("admin");

    const bad = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "wrong-password" });
    expect(bad.status).toBe(401);
  });

  it("returns TENANT_NOT_FOUND for a host on a slug that doesn't exist", async () => {
    const res = await login(`no-such-tenant-xyz.${ROOT_DOMAIN}`, { email: "a@b.com", password: "whatever" });
    expect(res.status).toBe(404);
  });

  it("returns TENANT_NOT_RESOLVED for a host outside ROOT_DOMAIN", async () => {
    const res = await login("evil.example.com", { email: "a@b.com", password: "whatever" });
    expect(res.status).toBe(400);
  });

  it("proxies an authenticated request to the employee-service with the bearer token intact", async () => {
    const s = slug("initech");
    const email = `admin@${s}.test`;
    await signup({ slug: s, name: "Initech", adminEmail: email, adminName: "Peter Admin", adminPassword: "pc-load-letter" });
    const loginRes = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "pc-load-letter" });
    const { data } = (await loginRes.json()) as { data: { token: string } };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "mock-employee" }], requestId: "mock" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await app.request(
      "/api/v1/employees?page=1",
      { headers: { authorization: `Bearer ${data.token}`, host: `${s}.${ROOT_DOMAIN}` } },
      testEnv,
    );

    expect(res.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const forwardedRequest = fetchSpy.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe("http://employee-service.test/api/v1/employees?page=1");
    expect(forwardedRequest.headers.get("authorization")).toBe(`Bearer ${data.token}`);

    fetchSpy.mockRestore();
  });

  it("rejects a proxied request with no bearer token before ever calling fetch", async () => {
    const s = slug("umbrella");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const res = await app.request("/api/v1/employees", { headers: { host: `${s}.${ROOT_DOMAIN}` } }, testEnv);

    expect(res.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
