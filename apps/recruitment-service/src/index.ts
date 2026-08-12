import { Hono } from "hono";
import { jwtAuth } from "@hrm/auth";
import { createLogger } from "@hrm/logger";
import type { Env } from "./env";
import { requestId } from "./middleware/requestId";
import { jobOpeningsRouter } from "./routes/jobOpenings";
import { candidatesRouter } from "./routes/candidates";
import { interviewsRouter } from "./routes/interviews";
import { offersRouter } from "./routes/offers";

export const app = new Hono<{ Bindings: Env }>();

app.use("*", requestId);

app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/ready", (c) => c.json({ status: "ok" }));

// Tenant resolution + subdomain<->token cross-check happen upstream at the
// Gateway (apps/gateway/src/middleware/tenant.ts); this service trusts the
// forwarded, already-signed AuthContext (docs/architecture/06-security.md).
app.use("/api/*", async (c, next) => jwtAuth<Env>()(c, next));

app.route("/api/v1/recruitment/job-openings", jobOpeningsRouter());
app.route("/api/v1/recruitment/candidates", candidatesRouter());
app.route("/api/v1/recruitment/interviews", interviewsRouter());
app.route("/api/v1/recruitment/offers", offersRouter());

app.notFound((c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Route not found" }, requestId: c.get("requestId") }, 404),
);

app.onError((err, c) => {
  const logger = createLogger({ service: "recruitment-service", requestId: c.get("requestId") });
  logger.error({ err }, "unhandled error");
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong" }, requestId: c.get("requestId") },
    500,
  );
});

export default app;
