import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { hasPermission, type LeaveBalance } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { forbidden, ok } from "../lib/response";
import { accrueLeaveBalances } from "../lib/accrual";

const { leaveBalances } = schema;

function serializeBalance(row: typeof leaveBalances.$inferSelect): LeaveBalance {
  return {
    ...row,
    entitled: Number(row.entitled),
    used: Number(row.used),
    carriedForward: Number(row.carriedForward),
  };
}

export function leaveBalancesRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/me", async (c) => {
    const auth = c.get("auth");
    if (!auth.employeeId) return forbidden(c);
    const year = Number.parseInt(c.req.query("year") ?? String(new Date().getUTCFullYear()), 10);

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .select()
        .from(leaveBalances)
        .where(and(eq(leaveBalances.employeeId, auth.employeeId as string), eq(leaveBalances.year, year))),
    );
    return ok(c, rows.map(serializeBalance));
  });

  // Org-wide balance visibility — approvers need it to sanity-check a
  // request before deciding, HR needs it for policy oversight.
  app.get("/", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "leave.approve_all") && !canUnscoped(auth, "leave.policy.manage")) return forbidden(c);
    const year = Number.parseInt(c.req.query("year") ?? String(new Date().getUTCFullYear()), 10);

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(leaveBalances).where(eq(leaveBalances.year, year)),
    );
    return ok(c, rows.map(serializeBalance));
  });

  // Manual trigger for the same job the Cron Trigger runs (src/index.ts's
  // `scheduled` handler) — scoped to the caller's own tenant only, so this
  // can't be used to force an accrual run against a different tenant.
  app.post("/accrual/run", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "leave.policy.manage")) return forbidden(c);

    const result = await accrueLeaveBalances(getDb(c.env.APP_DATABASE_URL), { tenantId: auth.tenantId });
    return ok(c, result);
  });

  return app;
}
