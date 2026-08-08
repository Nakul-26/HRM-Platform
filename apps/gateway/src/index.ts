import { Hono } from "hono";
import { createLogger } from "@hrm/logger";
import { jwtAuth, type AuthMiddlewareEnv } from "@hrm/auth";
import { requestId } from "./middleware/requestId";
import { tenantResolution } from "./middleware/tenant";

export interface Env extends AuthMiddlewareEnv {
  ROOT_DOMAIN: string;
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", requestId);

// Liveness/readiness are exempt from tenant resolution and auth — deploy
// gates and the platform's restart policy hit these directly by IP/localhost.
app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/ready", (c) => c.json({ status: "ok" }));

app.use("*", async (c, next) => tenantResolution(c.env.ROOT_DOMAIN)(c, next));
app.use("/api/*", async (c, next) => jwtAuth<Env>()(c, next));

app.get("/api/v1/whoami", (c) => {
  const auth = c.get("auth");
  return c.json({ data: auth, requestId: c.get("requestId") });
});

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
