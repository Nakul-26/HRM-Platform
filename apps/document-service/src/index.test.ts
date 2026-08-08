import { describe, expect, it } from "vitest";
import { signAccessToken } from "@hrm/auth";
import type { AuthContext } from "@hrm/types";
import app from "./index";

const JWT_SIGNING_KEY = "test-signing-key-at-least-32-characters-long";
const JWT_KID = "test";

const testEnv = {
  JWT_SIGNING_KEY,
  JWT_KID,
  S3_ENDPOINT: "http://localhost:9000",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_BUCKET: "hrm-documents",
};

function ctx(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    tenantId: "11111111-1111-1111-1111-111111111111",
    userId: "22222222-2222-2222-2222-222222222222",
    employeeId: "33333333-3333-3333-3333-333333333333",
    roleId: "44444444-4444-4444-4444-444444444444",
    roleName: "employee",
    permissions: ["employee.read", "employee.write"],
    ...overrides,
  };
}

async function bearerFor(auth: AuthContext) {
  const token = await signAccessToken(auth, { signingKey: JWT_SIGNING_KEY, kid: JWT_KID });
  return `Bearer ${token}`;
}

describe("document-service", () => {
  it("GET /health returns ok without auth", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
  });

  it("rejects presign-upload with no bearer token", async () => {
    const res = await app.request(
      "/api/v1/documents/presign-upload",
      { method: "POST", body: JSON.stringify({}), headers: { "content-type": "application/json" } },
      testEnv,
    );
    expect(res.status).toBe(401);
  });

  it("issues a presigned upload URL scoped to the caller's own tenant+employee prefix", async () => {
    const auth = ctx();
    const res = await app.request(
      "/api/v1/documents/presign-upload",
      {
        method: "POST",
        headers: { authorization: await bearerFor(auth), "content-type": "application/json" },
        body: JSON.stringify({ employeeId: auth.employeeId, fileName: "id-card.pdf", contentType: "application/pdf" }),
      },
      testEnv,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { objectKey: string; uploadUrl: string } };
    expect(body.data.objectKey).toMatch(new RegExp(`^tenants/${auth.tenantId}/employees/${auth.employeeId}/`));
    expect(body.data.uploadUrl).toContain(testEnv.S3_ENDPOINT);
  });

  it("rejects uploading for a different employee without employee.write_all", async () => {
    const auth = ctx();
    const res = await app.request(
      "/api/v1/documents/presign-upload",
      {
        method: "POST",
        headers: { authorization: await bearerFor(auth), "content-type": "application/json" },
        body: JSON.stringify({
          employeeId: "99999999-9999-9999-9999-999999999999",
          fileName: "id-card.pdf",
          contentType: "application/pdf",
        }),
      },
      testEnv,
    );
    expect(res.status).toBe(403);
  });

  it("allows an org-wide writer to upload on behalf of another employee", async () => {
    const auth = ctx({ roleName: "hr_manager", permissions: ["employee.write_all"] });
    const otherEmployeeId = "99999999-9999-9999-9999-999999999999";
    const res = await app.request(
      "/api/v1/documents/presign-upload",
      {
        method: "POST",
        headers: { authorization: await bearerFor(auth), "content-type": "application/json" },
        body: JSON.stringify({ employeeId: otherEmployeeId, fileName: "contract.pdf", contentType: "application/pdf" }),
      },
      testEnv,
    );
    expect(res.status).toBe(201);
  });

  it("rejects an unsupported content type", async () => {
    const auth = ctx();
    const res = await app.request(
      "/api/v1/documents/presign-upload",
      {
        method: "POST",
        headers: { authorization: await bearerFor(auth), "content-type": "application/json" },
        body: JSON.stringify({ employeeId: auth.employeeId, fileName: "malware.exe", contentType: "application/x-msdownload" }),
      },
      testEnv,
    );
    expect(res.status).toBe(400);
  });

  it("refuses to mint a download URL for another tenant's object key", async () => {
    const auth = ctx();
    const otherTenantKey = "tenants/other-tenant-id/employees/some-employee/some-file.pdf";
    const res = await app.request(
      `/api/v1/documents/download-url?objectKey=${encodeURIComponent(otherTenantKey)}`,
      { headers: { authorization: await bearerFor(auth) } },
      testEnv,
    );
    expect(res.status).toBe(403);
  });

  it("issues a download URL for the caller's own tenant", async () => {
    const auth = ctx();
    const ownKey = `tenants/${auth.tenantId}/employees/${auth.employeeId}/some-file.pdf`;
    const res = await app.request(
      `/api/v1/documents/download-url?objectKey=${encodeURIComponent(ownKey)}`,
      { headers: { authorization: await bearerFor(auth) } },
      testEnv,
    );
    expect(res.status).toBe(200);
  });
});
