import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { updatePayrollTaxConfigSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok } from "../lib/response";
import { toPayrollTaxConfig } from "../lib/payrollEngine";

const { payrollTaxConfig } = schema;

/** Numeric columns are written as strings (drizzle/postgres convention for `numeric`, see apps/leave-service/src/lib/accrual.ts) — `taxSlabs` is jsonb and passes through as-is. */
function toDbValues(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[key] = typeof value === "number" ? String(value) : value;
  }
  return out;
}

export function taxConfigRouter() {
  const app = new Hono<{ Bindings: Env }>();

  // Contains statutory rates — no self-service read need, unlike component types.
  app.get("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "payroll.structure.manage")) return forbidden(c);

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(payrollTaxConfig).where(eq(payrollTaxConfig.tenantId, auth.tenantId)),
    );
    if (!row) return notFound(c, "Payroll tax config");
    return ok(c, toPayrollTaxConfig(row));
  });

  app.patch("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "payroll.structure.manage")) return forbidden(c);

    const parsed = updatePayrollTaxConfigSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid tax config payload", parsed.error.flatten());
    if (Object.keys(parsed.data).length === 0) return fail(c, 400, "VALIDATION_ERROR", "No fields to update");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .update(payrollTaxConfig)
        .set({ ...toDbValues(parsed.data), updatedAt: new Date() })
        .where(eq(payrollTaxConfig.tenantId, auth.tenantId))
        .returning(),
    );
    if (!row) return notFound(c, "Payroll tax config");
    return ok(c, toPayrollTaxConfig(row));
  });

  return app;
}
