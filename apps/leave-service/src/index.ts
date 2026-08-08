import { Hono } from "hono";
import { jwtAuth } from "@hrm/auth";
import { createLogger } from "@hrm/logger";
import type { Env } from "./env";
import { requestId } from "./middleware/requestId";
import { leaveTypesRouter } from "./routes/leaveTypes";
import { holidaysRouter } from "./routes/holidays";
import { leaveBalancesRouter } from "./routes/leaveBalances";
import { leaveRequestsRouter } from "./routes/leaveRequests";
import { getDb } from "./db";
import { accrueLeaveBalances } from "./lib/accrual";

// Exported as a named binding (in addition to the default export below) so
// integration tests can call the Hono-only `app.request()` test helper —
// the default export is wrapped in a plain object for Wrangler's module
// worker format, which only recognizes `fetch`/`scheduled` on the object it imports.
export const app = new Hono<{ Bindings: Env }>();

app.use("*", requestId);

app.get("/health", (c) => c.json({ status: "ok" }));
app.get("/ready", (c) => c.json({ status: "ok" }));

// Tenant resolution + subdomain<->token cross-check happen upstream at the
// Gateway (apps/gateway/src/middleware/tenant.ts); this service trusts the
// forwarded, already-signed AuthContext (docs/architecture/06-security.md).
app.use("/api/*", async (c, next) => jwtAuth<Env>()(c, next));

app.route("/api/v1/leave/types", leaveTypesRouter());
app.route("/api/v1/leave/holidays", holidaysRouter());
app.route("/api/v1/leave/balances", leaveBalancesRouter());
app.route("/api/v1/leave/requests", leaveRequestsRouter());

app.notFound((c) =>
  c.json({ error: { code: "NOT_FOUND", message: "Route not found" }, requestId: c.get("requestId") }, 404),
);

app.onError((err, c) => {
  const logger = createLogger({ service: "leave-service", requestId: c.get("requestId") });
  logger.error({ err }, "unhandled error");
  return c.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong" }, requestId: c.get("requestId") },
    500,
  );
});

export default {
  fetch: app.fetch,
  // Cloudflare Cron Trigger (wrangler.jsonc's triggers.crons) — runs the
  // monthly accrual job across every tenant. See src/lib/accrual.ts for the
  // idempotency guarantee that makes a missed/retried tick safe.
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const logger = createLogger({ service: "leave-service", requestId: crypto.randomUUID() });
    const result = await accrueLeaveBalances(getDb(env.APP_DATABASE_URL));
    logger.info({ result }, "leave accrual run complete");
  },
};
