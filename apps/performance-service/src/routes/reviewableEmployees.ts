import { Hono } from "hono";
import { and, inArray, ne } from "drizzle-orm";
import { schema, withTenant } from "@hrm/db";
import type { Env } from "../env";
import { getDb } from "../db";
import { ok } from "../lib/response";
import { resolveVisibleEmployeeIds } from "../lib/visibility";

const { employees } = schema;

/**
 * Feeds the web admin's employee picker for creating a review — a manager
 * doesn't hold `employee.read_all`, so they can't use employee-service's own
 * list endpoint to find their reports' names for this form.
 */
export function reviewableEmployeesRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", async (c) => {
    const auth = c.get("auth");

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      const conditions = [
        visibleIds === null ? undefined : inArray(employees.id, visibleIds),
        auth.employeeId ? ne(employees.id, auth.employeeId) : undefined,
      ].filter((cond): cond is NonNullable<typeof cond> => cond !== undefined);
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      return tx.select({ id: employees.id, firstName: employees.firstName, lastName: employees.lastName }).from(employees).where(where);
    });

    return ok(c, rows);
  });

  return app;
}
