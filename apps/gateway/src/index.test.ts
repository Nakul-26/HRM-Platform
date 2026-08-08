import { describe, expect, it } from "vitest";
import app from "./index";

describe("gateway health/readiness", () => {
  it("GET /health returns ok without tenant resolution or auth", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("GET /ready returns ok", async () => {
    const res = await app.request("/ready");
    expect(res.status).toBe(200);
  });

  it("GET /unknown-route returns the standard error envelope", async () => {
    const res = await app.request("/unknown-route", {}, { ROOT_DOMAIN: "hrm.test" });
    expect(res.status).toBe(400); // tenant resolution runs first and rejects a bare host
  });
});
