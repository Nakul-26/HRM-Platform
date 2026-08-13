import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { loadEnv, baseEnvSchema } from "@hrm/config";
import { createDbClient, schema, type Database } from "@hrm/db";
import { encryptSecret, verifyAccessToken, verifyEphemeralToken } from "@hrm/auth";
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
    WEB_APP_PORT: "3000",
    APP_ENCRYPTION_KEY: "0vMmP/Rwx75VDKgxVZa3Yjk9nJ96jX6s4iBsZs4XCJ4=",
    EMPLOYEE_SERVICE_URL: "http://employee-service.test",
    DOCUMENT_SERVICE_URL: "http://document-service.test",
    LEAVE_SERVICE_URL: "http://leave-service.test",
    ATTENDANCE_SERVICE_URL: "http://attendance-service.test",
    PAYROLL_SERVICE_URL: "http://payroll-service.test",
    RECRUITMENT_SERVICE_URL: "http://recruitment-service.test",
    PERFORMANCE_SERVICE_URL: "http://performance-service.test",
    REPORTING_SERVICE_URL: "http://reporting-service.test",
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

    await adminDb.delete(schema.mfaTotpCredentials).where(inArray(schema.mfaTotpCredentials.tenantId, tenantIds));
    await adminDb.delete(schema.ssoConnections).where(inArray(schema.ssoConnections.tenantId, tenantIds));
    await adminDb.delete(schema.tenantSettings).where(inArray(schema.tenantSettings.tenantId, tenantIds));
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

  it("proxies an authenticated request to the leave-service with the bearer token intact", async () => {
    const s = slug("hooli");
    const email = `admin@${s}.test`;
    await signup({ slug: s, name: "Hooli", adminEmail: email, adminName: "Gavin Admin", adminPassword: "tres-comas-1" });
    const loginRes = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "tres-comas-1" });
    const { data } = (await loginRes.json()) as { data: { token: string } };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [], requestId: "mock" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await app.request(
      "/api/v1/leave/requests",
      { headers: { authorization: `Bearer ${data.token}`, host: `${s}.${ROOT_DOMAIN}` } },
      testEnv,
    );

    expect(res.status).toBe(200);
    const forwardedRequest = fetchSpy.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe("http://leave-service.test/api/v1/leave/requests");

    fetchSpy.mockRestore();
  });

  it("proxies an authenticated request to the attendance-service with the bearer token intact", async () => {
    const s = slug("massive-dynamic");
    const email = `admin@${s}.test`;
    await signup({ slug: s, name: "Massive Dynamic", adminEmail: email, adminName: "Nina Admin", adminPassword: "walter-bishop-1" });
    const loginRes = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "walter-bishop-1" });
    const { data } = (await loginRes.json()) as { data: { token: string } };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [], requestId: "mock" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await app.request(
      "/api/v1/attendance/records",
      { headers: { authorization: `Bearer ${data.token}`, host: `${s}.${ROOT_DOMAIN}` } },
      testEnv,
    );

    expect(res.status).toBe(200);
    const forwardedRequest = fetchSpy.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe("http://attendance-service.test/api/v1/attendance/records");

    fetchSpy.mockRestore();
  });

  it("proxies an authenticated request to the payroll-service with the bearer token intact", async () => {
    const s = slug("gringotts");
    const email = `admin@${s}.test`;
    await signup({ slug: s, name: "Gringotts", adminEmail: email, adminName: "Bill Weasley", adminPassword: "curse-breaker-1" });
    const loginRes = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "curse-breaker-1" });
    const { data } = (await loginRes.json()) as { data: { token: string } };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [], requestId: "mock" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await app.request(
      "/api/v1/payroll/runs",
      { headers: { authorization: `Bearer ${data.token}`, host: `${s}.${ROOT_DOMAIN}` } },
      testEnv,
    );

    expect(res.status).toBe(200);
    const forwardedRequest = fetchSpy.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe("http://payroll-service.test/api/v1/payroll/runs");

    fetchSpy.mockRestore();
  });

  it("proxies an authenticated request to the recruitment-service with the bearer token intact", async () => {
    const s = slug("wonka");
    const email = `admin@${s}.test`;
    await signup({ slug: s, name: "Wonka Industries", adminEmail: email, adminName: "Willy Admin", adminPassword: "golden-ticket-1" });
    const loginRes = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "golden-ticket-1" });
    const { data } = (await loginRes.json()) as { data: { token: string } };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [], requestId: "mock" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await app.request(
      "/api/v1/recruitment/candidates",
      { headers: { authorization: `Bearer ${data.token}`, host: `${s}.${ROOT_DOMAIN}` } },
      testEnv,
    );

    expect(res.status).toBe(200);
    const forwardedRequest = fetchSpy.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe("http://recruitment-service.test/api/v1/recruitment/candidates");

    fetchSpy.mockRestore();
  });

  it("proxies an authenticated request to the performance-service with the bearer token intact", async () => {
    const s = slug("stark-industries");
    const email = `admin@${s}.test`;
    await signup({ slug: s, name: "Stark Industries", adminEmail: email, adminName: "Tony Admin", adminPassword: "jarvis-online-1" });
    const loginRes = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "jarvis-online-1" });
    const { data } = (await loginRes.json()) as { data: { token: string } };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [], requestId: "mock" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await app.request(
      "/api/v1/performance/goals",
      { headers: { authorization: `Bearer ${data.token}`, host: `${s}.${ROOT_DOMAIN}` } },
      testEnv,
    );

    expect(res.status).toBe(200);
    const forwardedRequest = fetchSpy.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe("http://performance-service.test/api/v1/performance/goals");

    fetchSpy.mockRestore();
  });

  it("proxies an authenticated request to the reporting-service with the bearer token intact", async () => {
    const s = slug("wayne-enterprises");
    const email = `admin@${s}.test`;
    await signup({ slug: s, name: "Wayne Enterprises", adminEmail: email, adminName: "Bruce Admin", adminPassword: "i-am-batman-1" });
    const loginRes = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "i-am-batman-1" });
    const { data } = (await loginRes.json()) as { data: { token: string } };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [], requestId: "mock" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const res = await app.request(
      "/api/v1/reporting/headcount",
      { headers: { authorization: `Bearer ${data.token}`, host: `${s}.${ROOT_DOMAIN}` } },
      testEnv,
    );

    expect(res.status).toBe(200);
    const forwardedRequest = fetchSpy.mock.calls[0]?.[0] as Request;
    expect(forwardedRequest.url).toBe("http://reporting-service.test/api/v1/reporting/headcount");

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

  describe("MFA (TOTP)", () => {
    async function mfaPost(path: string, body: Record<string, unknown>, bearerToken?: string) {
      return app.request(
        `/api/v1/auth/mfa${path}`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}),
          },
          body: JSON.stringify(body),
        },
        testEnv,
      );
    }

    async function mfaGet(path: string, bearerToken: string) {
      return app.request(`/api/v1/auth/mfa${path}`, { headers: { authorization: `Bearer ${bearerToken}` } }, testEnv);
    }

    it("enroll -> login demands a code -> wrong code rejected -> correct code completes login", async () => {
      const s = slug("piedpiper");
      const email = `admin@${s}.test`;
      await signup({ slug: s, name: "Pied Piper", adminEmail: email, adminName: "Richard Admin", adminPassword: "middle-out-1" });
      const firstLogin = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "middle-out-1" });
      const { data: firstAuth } = (await firstLogin.json()) as { data: { token: string } };

      const statusBefore = await mfaGet("/status", firstAuth.token);
      expect((await statusBefore.json()) as { data: { enabled: boolean } }).toMatchObject({ data: { enabled: false } });

      const startRes = await mfaPost("/enroll/start", {}, firstAuth.token);
      expect(startRes.status).toBe(200);
      const { data: enrollData } = (await startRes.json()) as { data: { secret: string; otpauthUri: string; backupCodes: string[] } };
      expect(enrollData.otpauthUri).toContain("otpauth://totp/");
      expect(enrollData.backupCodes).toHaveLength(8);

      const { totp } = await import("@hrm/auth");
      const goodCode = await totp(enrollData.secret, Math.floor(Date.now() / 1000 / 30));

      const confirmRes = await mfaPost("/enroll/confirm", { code: "000000" }, firstAuth.token);
      expect(confirmRes.status).toBe(401); // wrong code during confirm

      const realConfirmRes = await mfaPost("/enroll/confirm", { code: goodCode }, firstAuth.token);
      expect(realConfirmRes.status).toBe(200);
      expect((await realConfirmRes.json()) as { data: { enabled: boolean } }).toMatchObject({ data: { enabled: true } });

      const statusAfter = await mfaGet("/status", firstAuth.token);
      expect((await statusAfter.json()) as { data: { enabled: boolean } }).toMatchObject({ data: { enabled: true } });

      const secondLogin = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "middle-out-1" });
      expect(secondLogin.status).toBe(200);
      const { data: challenge } = (await secondLogin.json()) as { data: { mfaRequired: boolean; mfaToken: string } };
      expect(challenge.mfaRequired).toBe(true);

      const wrongVerify = await mfaPost("/verify", { mfaToken: challenge.mfaToken, code: "111111" });
      expect(wrongVerify.status).toBe(401);

      const currentCode = await totp(enrollData.secret, Math.floor(Date.now() / 1000 / 30));
      const rightVerify = await mfaPost("/verify", { mfaToken: challenge.mfaToken, code: currentCode });
      expect(rightVerify.status).toBe(200);
      const { data: finalAuth } = (await rightVerify.json()) as { data: { token: string; auth: { roleName: string } } };
      expect(finalAuth.auth.roleName).toBe("admin");

      const verifiedAuth = await verifyAccessToken(finalAuth.token, { signingKey: env.JWT_SIGNING_KEY, kid: env.JWT_KID });
      expect(verifiedAuth.roleName).toBe("admin");
    });

    it("accepts a backup code once during the MFA challenge, then rejects reusing it", async () => {
      const s = slug("hooli-mfa");
      const email = `admin@${s}.test`;
      await signup({ slug: s, name: "Hooli MFA", adminEmail: email, adminName: "Gavin Admin", adminPassword: "box-1234" });
      const firstLogin = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "box-1234" });
      const { data: firstAuth } = (await firstLogin.json()) as { data: { token: string } };

      const startRes = await mfaPost("/enroll/start", {}, firstAuth.token);
      const { data: enrollData } = (await startRes.json()) as { data: { secret: string; backupCodes: string[] } };
      const { totp } = await import("@hrm/auth");
      const goodCode = await totp(enrollData.secret, Math.floor(Date.now() / 1000 / 30));
      await mfaPost("/enroll/confirm", { code: goodCode }, firstAuth.token);

      const challengeLogin = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "box-1234" });
      const { data: challenge } = (await challengeLogin.json()) as { data: { mfaToken: string } };

      const backupCode = enrollData.backupCodes[0]!;
      const firstUse = await mfaPost("/verify", { mfaToken: challenge.mfaToken, code: backupCode });
      expect(firstUse.status).toBe(200);

      const secondChallengeLogin = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "box-1234" });
      const { data: secondChallenge } = (await secondChallengeLogin.json()) as { data: { mfaToken: string } };
      const secondUse = await mfaPost("/verify", { mfaToken: secondChallenge.mfaToken, code: backupCode });
      expect(secondUse.status).toBe(401);
    });

    it("forces MFA setup at login when the tenant's policy requires it for the user's role, then completes login on confirm", async () => {
      const s = slug("acme-forced");
      const email = `admin@${s}.test`;
      const signupRes = await signup({
        slug: s,
        name: "Acme Forced MFA",
        adminEmail: email,
        adminName: "Ada Admin",
        adminPassword: "forced-setup-1",
      });
      const { data: signupData } = (await signupRes.json()) as { data: { tenant: { id: string } } };

      await adminDb
        .insert(schema.tenantSettings)
        .values({ tenantId: signupData.tenant.id, key: "mfa_required_roles", value: ["admin"] });

      const loginRes = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "forced-setup-1" });
      expect(loginRes.status).toBe(200);
      const { data: setupChallenge } = (await loginRes.json()) as { data: { mfaSetupRequired: boolean; mfaToken: string } };
      expect(setupChallenge.mfaSetupRequired).toBe(true);

      const startRes = await mfaPost("/enroll/start", { mfaToken: setupChallenge.mfaToken });
      expect(startRes.status).toBe(200);
      const { data: enrollData } = (await startRes.json()) as { data: { secret: string } };

      const { totp } = await import("@hrm/auth");
      const code = await totp(enrollData.secret, Math.floor(Date.now() / 1000 / 30));
      const confirmRes = await mfaPost("/enroll/confirm", { mfaToken: setupChallenge.mfaToken, code });
      expect(confirmRes.status).toBe(200);
      const { data: finalAuth } = (await confirmRes.json()) as { data: { token: string; auth: { roleName: string } } };
      expect(finalAuth.auth.roleName).toBe("admin");
      expect(typeof finalAuth.token).toBe("string");
    });

    it("disable requires a valid code and then login no longer challenges", async () => {
      const s = slug("disable-mfa");
      const email = `admin@${s}.test`;
      await signup({ slug: s, name: "Disable MFA", adminEmail: email, adminName: "Admin", adminPassword: "disable-me-1" });
      const firstLogin = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "disable-me-1" });
      const { data: firstAuth } = (await firstLogin.json()) as { data: { token: string } };

      const startRes = await mfaPost("/enroll/start", {}, firstAuth.token);
      const { data: enrollData } = (await startRes.json()) as { data: { secret: string } };
      const { totp } = await import("@hrm/auth");
      const goodCode = await totp(enrollData.secret, Math.floor(Date.now() / 1000 / 30));
      await mfaPost("/enroll/confirm", { code: goodCode }, firstAuth.token);

      const disableWrong = await mfaPost("/disable", { code: "000000" }, firstAuth.token);
      expect(disableWrong.status).toBe(401);

      const disableCode = await totp(enrollData.secret, Math.floor(Date.now() / 1000 / 30));
      const disableRes = await mfaPost("/disable", { code: disableCode }, firstAuth.token);
      expect(disableRes.status).toBe(200);

      const loginAfterDisable = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "disable-me-1" });
      const { data: authAfterDisable } = (await loginAfterDisable.json()) as { data: { token?: string; mfaRequired?: boolean } };
      expect(authAfterDisable.mfaRequired).toBeUndefined();
      expect(typeof authAfterDisable.token).toBe("string");
    });
  });

  describe("SSO (OIDC)", () => {
    let idpServer: Server;
    let idpBaseUrl: string;
    let currentTokenResponse: unknown;
    let currentJwks: unknown;

    beforeAll(async () => {
      idpServer = createServer((req, res) => {
        res.setHeader("content-type", "application/json");
        if (req.url === "/jwks") {
          res.end(JSON.stringify(currentJwks));
        } else if (req.url === "/token") {
          res.end(JSON.stringify(currentTokenResponse));
        } else {
          res.statusCode = 404;
          res.end("{}");
        }
      });
      await new Promise<void>((resolve) => idpServer.listen(0, "127.0.0.1", resolve));
      const address = idpServer.address() as AddressInfo;
      idpBaseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => idpServer.close(() => resolve()));
    });

    async function createSsoConnection(tenantId: string) {
      const clientSecretCiphertext = await encryptSecret("mock-client-secret", testEnv.APP_ENCRYPTION_KEY);
      await adminDb.insert(schema.ssoConnections).values({
        tenantId,
        issuer: idpBaseUrl,
        clientId: "mock-client-id",
        clientSecretCiphertext,
        authorizationEndpoint: `${idpBaseUrl}/authorize`,
        tokenEndpoint: `${idpBaseUrl}/token`,
        jwksUri: `${idpBaseUrl}/jwks`,
        enabled: true,
      });
    }

    async function signIdToken(claims: Record<string, unknown>) {
      const { publicKey, privateKey } = await generateKeyPair("ES256");
      const jwk = await exportJWK(publicKey);
      currentJwks = { keys: [{ ...jwk, kid: "mock-kid", use: "sig", alg: "ES256" }] };
      const idToken = await new SignJWT(claims)
        .setProtectedHeader({ alg: "ES256", kid: "mock-kid" })
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      currentTokenResponse = { id_token: idToken, access_token: "mock-access-token" };
    }

    it("GET /status reflects whether SSO is enabled for the tenant", async () => {
      const s = slug("sso-status");
      const email = `admin@${s}.test`;
      const signupRes = await signup({ slug: s, name: "SSO Status Co", adminEmail: email, adminName: "Admin", adminPassword: "status-1" });
      const { data } = (await signupRes.json()) as { data: { tenant: { id: string } } };

      const before = await app.request("/api/v1/auth/sso/status", { headers: { host: `${s}.${ROOT_DOMAIN}` } }, testEnv);
      expect((await before.json()) as { data: { enabled: boolean } }).toMatchObject({ data: { enabled: false } });

      await createSsoConnection(data.tenant.id);
      const after = await app.request("/api/v1/auth/sso/status", { headers: { host: `${s}.${ROOT_DOMAIN}` } }, testEnv);
      expect((await after.json()) as { data: { enabled: boolean } }).toMatchObject({ data: { enabled: true } });
    });

    it("GET /login redirects to the IdP's authorization endpoint with PKCE and state", async () => {
      const s = slug("sso-login-redirect");
      const email = `admin@${s}.test`;
      const signupRes = await signup({ slug: s, name: "SSO Redirect Co", adminEmail: email, adminName: "Admin", adminPassword: "redirect-1" });
      const { data } = (await signupRes.json()) as { data: { tenant: { id: string } } };
      await createSsoConnection(data.tenant.id);

      const res = await app.request(
        "/api/v1/auth/sso/login",
        { redirect: "manual", headers: { host: `${s}.${ROOT_DOMAIN}` } },
        testEnv,
      );
      expect(res.status).toBe(302);
      const location = new URL(res.headers.get("location")!);
      expect(location.origin + location.pathname).toBe(`${idpBaseUrl}/authorize`);
      expect(location.searchParams.get("code_challenge_method")).toBe("S256");
      expect(location.searchParams.get("client_id")).toBe("mock-client-id");
      expect(location.searchParams.get("state")).toBeTruthy();
      expect(location.searchParams.get("nonce")).toBeTruthy();
    });

    it("completes the full OIDC callback flow for an existing user and sets the session cookie", async () => {
      const s = slug("sso-full-flow");
      const email = `admin@${s}.test`;
      const signupRes = await signup({ slug: s, name: "SSO Full Flow Co", adminEmail: email, adminName: "Admin", adminPassword: "full-flow-1" });
      const { data } = (await signupRes.json()) as { data: { tenant: { id: string } } };
      await createSsoConnection(data.tenant.id);

      const loginRes = await app.request(
        "/api/v1/auth/sso/login",
        { redirect: "manual", headers: { host: `${s}.${ROOT_DOMAIN}` } },
        testEnv,
      );
      const location = new URL(loginRes.headers.get("location")!);
      const state = location.searchParams.get("state")!;
      const statePayload = await verifyEphemeralToken<{ nonce: string }>(state, {
        signingKey: testEnv.JWT_SIGNING_KEY,
        kid: testEnv.JWT_KID,
      });

      await signIdToken({
        iss: idpBaseUrl,
        aud: "mock-client-id",
        nonce: statePayload.nonce,
        email,
        sub: "idp-subject-1",
      });

      const callbackRes = await app.request(
        `/api/v1/auth/sso/callback?code=mock-code&state=${encodeURIComponent(state)}`,
        { redirect: "manual", headers: { host: `${s}.${ROOT_DOMAIN}` } },
        testEnv,
      );
      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.get("location")).toContain(`${s}.${ROOT_DOMAIN}`);
      const setCookie = callbackRes.headers.get("set-cookie")!;
      expect(setCookie).toContain("hrm_token=");

      const token = /hrm_token=([^;]+)/.exec(setCookie)![1]!;
      const auth = await verifyAccessToken(token, { signingKey: env.JWT_SIGNING_KEY, kid: env.JWT_KID });
      expect(auth.tenantId).toBe(data.tenant.id);
      expect(auth.roleName).toBe("admin");
    });

    it("redirects to an error page instead of minting a token when no user matches the IdP-asserted email", async () => {
      const s = slug("sso-no-account");
      const adminEmail = `admin@${s}.test`;
      const signupRes = await signup({ slug: s, name: "SSO No Account Co", adminEmail, adminName: "Admin", adminPassword: "no-account-1" });
      const { data } = (await signupRes.json()) as { data: { tenant: { id: string } } };
      await createSsoConnection(data.tenant.id);

      const loginRes = await app.request(
        "/api/v1/auth/sso/login",
        { redirect: "manual", headers: { host: `${s}.${ROOT_DOMAIN}` } },
        testEnv,
      );
      const location = new URL(loginRes.headers.get("location")!);
      const state = location.searchParams.get("state")!;
      const statePayload = await verifyEphemeralToken<{ nonce: string }>(state, {
        signingKey: testEnv.JWT_SIGNING_KEY,
        kid: testEnv.JWT_KID,
      });

      await signIdToken({
        iss: idpBaseUrl,
        aud: "mock-client-id",
        nonce: statePayload.nonce,
        email: `no-such-user@${s}.test`,
        sub: "idp-subject-2",
      });

      const callbackRes = await app.request(
        `/api/v1/auth/sso/callback?code=mock-code&state=${encodeURIComponent(state)}`,
        { redirect: "manual", headers: { host: `${s}.${ROOT_DOMAIN}` } },
        testEnv,
      );
      expect(callbackRes.status).toBe(302);
      expect(callbackRes.headers.get("location")).toContain("error=sso_no_account");
      expect(callbackRes.headers.get("set-cookie")).toBeNull();
    });

    it("rejects a callback whose state was issued for a different tenant", async () => {
      const s1 = slug("sso-tenant-one");
      const s2 = slug("sso-tenant-two");
      const email1 = `admin@${s1}.test`;
      const email2 = `admin@${s2}.test`;
      const res1 = await signup({ slug: s1, name: "Tenant One", adminEmail: email1, adminName: "Admin", adminPassword: "tenant-one-1" });
      const res2 = await signup({ slug: s2, name: "Tenant Two", adminEmail: email2, adminName: "Admin", adminPassword: "tenant-two-1" });
      const { data: data1 } = (await res1.json()) as { data: { tenant: { id: string } } };
      const { data: data2 } = (await res2.json()) as { data: { tenant: { id: string } } };
      await createSsoConnection(data1.tenant.id);
      await createSsoConnection(data2.tenant.id);

      const loginRes = await app.request(
        "/api/v1/auth/sso/login",
        { redirect: "manual", headers: { host: `${s1}.${ROOT_DOMAIN}` } },
        testEnv,
      );
      const state = new URL(loginRes.headers.get("location")!).searchParams.get("state")!;

      // Replay tenant 1's state token against tenant 2's callback.
      const callbackRes = await app.request(
        `/api/v1/auth/sso/callback?code=mock-code&state=${encodeURIComponent(state)}`,
        { headers: { host: `${s2}.${ROOT_DOMAIN}` } },
        testEnv,
      );
      expect(callbackRes.status).toBe(400);
      const body = (await callbackRes.json()) as { error: { code: string } };
      expect(body.error.code).toBe("INVALID_STATE");
    });
  });

  describe("Settings: SSO connection + MFA policy", () => {
    let discoveryServer: Server;
    let discoveryBaseUrl: string;

    beforeAll(async () => {
      discoveryServer = createServer((req, res) => {
        res.setHeader("content-type", "application/json");
        if (req.url === "/.well-known/openid-configuration") {
          res.end(
            JSON.stringify({
              authorization_endpoint: `${discoveryBaseUrl}/authorize`,
              token_endpoint: `${discoveryBaseUrl}/token`,
              jwks_uri: `${discoveryBaseUrl}/jwks`,
            }),
          );
        } else {
          res.statusCode = 404;
          res.end("{}");
        }
      });
      await new Promise<void>((resolve) => discoveryServer.listen(0, "127.0.0.1", resolve));
      const address = discoveryServer.address() as AddressInfo;
      discoveryBaseUrl = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
      await new Promise<void>((resolve) => discoveryServer.close(() => resolve()));
    });

    async function nonAdminToken(tenantId: string) {
      const { signAccessToken } = await import("@hrm/auth");
      return signAccessToken(
        { tenantId, userId: "00000000-0000-0000-0000-000000000000", employeeId: null, roleId: "00000000-0000-0000-0000-000000000000", roleName: "employee", permissions: [] },
        { signingKey: testEnv.JWT_SIGNING_KEY, kid: testEnv.JWT_KID },
      );
    }

    it("rejects a non-admin caller with 403", async () => {
      const s = slug("settings-forbidden");
      const email = `admin@${s}.test`;
      const signupRes = await signup({ slug: s, name: "Forbidden Co", adminEmail: email, adminName: "Admin", adminPassword: "forbidden-1" });
      const { data } = (await signupRes.json()) as { data: { tenant: { id: string } } };
      const token = await nonAdminToken(data.tenant.id);

      const res = await app.request(
        "/api/v1/settings/sso",
        { headers: { authorization: `Bearer ${token}`, host: `${s}.${ROOT_DOMAIN}` } },
        testEnv,
      );
      expect(res.status).toBe(403);
    });

    it("creates an SSO connection via PUT (running real OIDC discovery), never exposes the secret, and DELETE removes it", async () => {
      const s = slug("settings-crud");
      const email = `admin@${s}.test`;
      await signup({ slug: s, name: "Settings CRUD Co", adminEmail: email, adminName: "Admin", adminPassword: "settings-crud-1" });
      const loginRes = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "settings-crud-1" });
      const { data: authData } = (await loginRes.json()) as { data: { token: string } };
      const headers = { authorization: `Bearer ${authData.token}`, host: `${s}.${ROOT_DOMAIN}`, "content-type": "application/json" };

      const before = await app.request("/api/v1/settings/sso", { headers }, testEnv);
      expect((await before.json()) as { data: { configured: boolean } }).toMatchObject({ data: { configured: false } });

      const putRes = await app.request(
        "/api/v1/settings/sso",
        { method: "PUT", headers, body: JSON.stringify({ issuer: discoveryBaseUrl, clientId: "real-client-id", clientSecret: "real-client-secret" }) },
        testEnv,
      );
      expect(putRes.status).toBe(200);
      const putBody = (await putRes.json()) as { data: Record<string, unknown> };
      expect(putBody.data.configured).toBe(true);
      expect(putBody.data.authorizationEndpoint).toBe(`${discoveryBaseUrl}/authorize`);
      expect(putBody.data).not.toHaveProperty("clientSecretCiphertext");
      expect(JSON.stringify(putBody.data)).not.toContain("real-client-secret");

      const after = await app.request("/api/v1/settings/sso", { headers }, testEnv);
      expect((await after.json()) as { data: { configured: boolean } }).toMatchObject({ data: { configured: true } });

      const del = await app.request("/api/v1/settings/sso", { method: "DELETE", headers }, testEnv);
      expect(del.status).toBe(204);

      const afterDelete = await app.request("/api/v1/settings/sso", { headers }, testEnv);
      expect((await afterDelete.json()) as { data: { configured: boolean } }).toMatchObject({ data: { configured: false } });
    });

    it("rejects a PUT with an issuer that fails OIDC discovery", async () => {
      const s = slug("settings-bad-issuer");
      const email = `admin@${s}.test`;
      await signup({ slug: s, name: "Bad Issuer Co", adminEmail: email, adminName: "Admin", adminPassword: "bad-issuer-1" });
      const loginRes = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "bad-issuer-1" });
      const { data: authData } = (await loginRes.json()) as { data: { token: string } };

      const res = await app.request(
        "/api/v1/settings/sso",
        {
          method: "PUT",
          headers: { authorization: `Bearer ${authData.token}`, host: `${s}.${ROOT_DOMAIN}`, "content-type": "application/json" },
          body: JSON.stringify({ issuer: "https://idp-does-not-exist.invalid", clientId: "x", clientSecret: "y" }),
        },
        testEnv,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: { code: string } };
      expect(body.error.code).toBe("OIDC_DISCOVERY_FAILED");
    });

    it("PUT /mfa-policy sets the required-roles list and GET reflects it", async () => {
      const s = slug("settings-mfa-policy");
      const email = `admin@${s}.test`;
      await signup({ slug: s, name: "MFA Policy Co", adminEmail: email, adminName: "Admin", adminPassword: "mfa-policy-1" });
      const loginRes = await login(`${s}.${ROOT_DOMAIN}`, { email, password: "mfa-policy-1" });
      const { data: authData } = (await loginRes.json()) as { data: { token: string } };
      const headers = { authorization: `Bearer ${authData.token}`, host: `${s}.${ROOT_DOMAIN}`, "content-type": "application/json" };

      const before = await app.request("/api/v1/settings/mfa-policy", { headers }, testEnv);
      expect((await before.json()) as { data: { requiredRoles: string[] } }).toMatchObject({ data: { requiredRoles: [] } });

      const putRes = await app.request(
        "/api/v1/settings/mfa-policy",
        { method: "PUT", headers, body: JSON.stringify({ requiredRoles: ["admin", "hr_manager"] }) },
        testEnv,
      );
      expect(putRes.status).toBe(200);

      const after = await app.request("/api/v1/settings/mfa-policy", { headers }, testEnv);
      expect((await after.json()) as { data: { requiredRoles: string[] } }).toMatchObject({
        data: { requiredRoles: ["admin", "hr_manager"] },
      });
    });
  });
});
