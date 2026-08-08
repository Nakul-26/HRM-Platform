import { Hono } from "hono";
import { createLogger } from "@hrm/logger";
import { jwtAuth } from "@hrm/auth";
import type { Env } from "./env";
import { requestId } from "./middleware/requestId";
import { tenantResolution } from "./middleware/tenant";
import { authRouter } from "./routes/auth";
import { proxyRouter } from "./routes/proxy";

export type { Env };

const app = new Hono<{ Bindings: Env }>();

app.use("*", requestId);

// Liveness/readiness are exempt from tenant resolution and auth — deploy
// gates and the platform's restart policy hit these directly by IP/localhost.
app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/ready", (c) => c.json({ status: "ok" }));

// Signup and login are both reachable without a tenant already resolved by
// middleware or a bearer token already issued — mounted before both
// tenantResolution and jwtAuth so they terminate the chain first (same
// pattern as /health, /ready above). See src/routes/auth.ts for how each
// resolves what it needs on its own.
app.route("/api/v1/auth", authRouter());

app.use("*", async (c, next) => tenantResolution(c.env.ROOT_DOMAIN)(c, next));
app.use("/api/*", async (c, next) => jwtAuth<Env>()(c, next));

app.get("/api/v1/whoami", (c) => {
  const auth = c.get("auth");
  return c.json({ data: auth, requestId: c.get("requestId") });
});

// Everything else under /api/v1/* is a plain proxy to the owning downstream
// service (docs/architecture/01-services-and-communication.md) — the
// frontend only ever talks to this Gateway.
app.route("/api/v1/departments", proxyRouter((env) => env.EMPLOYEE_SERVICE_URL));
app.route("/api/v1/branches", proxyRouter((env) => env.EMPLOYEE_SERVICE_URL));
app.route("/api/v1/designations", proxyRouter((env) => env.EMPLOYEE_SERVICE_URL));
app.route("/api/v1/employees", proxyRouter((env) => env.EMPLOYEE_SERVICE_URL));
app.route("/api/v1/documents", proxyRouter((env) => env.DOCUMENT_SERVICE_URL));

app.notFound((c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Route not found" }, requestId: c.get("requestId") }, 404),
);

app.onError((err, c) => {
  const logger = createLogger({ service: "gateway", requestId: c.get("requestId") });
  logger.error({ err }, "unhandled error");
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong" }, requestId: c.get("requestId") },
    500,
  );
});

export default app;
