import { Hono } from "hono";
import { jwtAuth } from "@hrm/auth";
import { createLogger } from "@hrm/logger";
import type { Env } from "./env";
import { requestId } from "./middleware/requestId";
import { departmentsRouter } from "./routes/departments";
import { branchesRouter } from "./routes/branches";
import { designationsRouter } from "./routes/designations";
import { employeesRouter } from "./routes/employees";

const app = new Hono<{ Bindings: Env }>();

app.use("*", requestId);

app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/ready", (c) => c.json({ status: "ok" }));

// Tenant resolution + subdomain<->token cross-check happen upstream at the
// Gateway (apps/gateway/src/middleware/tenant.ts); this service trusts the
// forwarded, already-signed AuthContext (docs/architecture/06-security.md).
app.use("/api/*", async (c, next) => jwtAuth<Env>()(c, next));

app.route("/api/v1/departments", departmentsRouter());
app.route("/api/v1/branches", branchesRouter());
app.route("/api/v1/designations", designationsRouter());
app.route("/api/v1/employees", employeesRouter());

app.notFound((c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Route not found" }, requestId: c.get("requestId") }, 404),
);

app.onError((err, c) => {
  const logger = createLogger({ service: "employee-service", requestId: c.get("requestId") });
  logger.error({ err }, "unhandled error");
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong" }, requestId: c.get("requestId") },
    500,
  );
});

export default app;
