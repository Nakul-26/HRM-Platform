import { Hono, type Context } from "hono";
import { eq, inArray, sql } from "drizzle-orm";
import { schema, withTenant } from "@hrm/db";
import { can } from "@hrm/auth";
import { hasPermission, type Payslip } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";
import { resolveVisibleEmployeeIds } from "../lib/visibility";
import { createPresignedGetUrl } from "../lib/s3";
import { objectKeyBelongsToTenant } from "../lib/objectKey";

const { payslips, employees, payrollRuns } = schema;

/** `periodMonth`/`periodYear` live on the parent run, not the payslip row — every route here joins it in, since a payslip with no visible period is unusable. */
function serializePayslip(row: typeof payslips.$inferSelect, run: { periodMonth: number; periodYear: number }): Payslip {
  return {
    ...row,
    periodMonth: run.periodMonth,
    periodYear: run.periodYear,
    grossEarnings: Number(row.grossEarnings),
    totalDeductions: Number(row.totalDeductions),
    netPay: Number(row.netPay),
    breakdown: row.breakdown as Payslip["breakdown"],
  };
}

export function payslipsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/me", async (c) => {
    const auth = c.get("auth");
    if (!auth.employeeId) return forbidden(c);

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .select({ payslip: payslips, run: payrollRuns })
        .from(payslips)
        .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
        .where(eq(payslips.employeeId, auth.employeeId as string))
        .orderBy(payslips.createdAt),
    );
    return ok(c, rows.map((r) => serializePayslip(r.payslip, r.run)));
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { created_at: payslips.createdAt }, payslips.createdAt);

    const db = getDb(c.env.APP_DATABASE_URL);
    const { rows, total } = await withTenant(db, auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      const where = visibleIds === null ? undefined : visibleIds.length > 0 ? inArray(payslips.employeeId, visibleIds) : sql`false`;

      const [rows, countRows] = await Promise.all([
        tx
          .select({ payslip: payslips, run: payrollRuns })
          .from(payslips)
          .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
          .where(where)
          .orderBy(...sort)
          .limit(perPage)
          .offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(payslips).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows.map((r) => serializePayslip(r.payslip, r.run)), { page, perPage, total });
  });

  async function loadOwnedPayslip(c: Context<{ Bindings: Env }>, id: string) {
    const auth = c.get("auth");
    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .select({ payslip: payslips, managerId: employees.managerId, run: payrollRuns })
        .from(payslips)
        .innerJoin(employees, eq(payslips.employeeId, employees.id))
        .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
        .where(eq(payslips.id, id)),
    );
    if (!row) return { ok: false as const, response: notFound(c, "Payslip") };

    const isSelf = row.payslip.employeeId === auth.employeeId;
    const isDirectReport = row.managerId === auth.employeeId;
    if (!can(auth, "payroll.view", { isSelf, isDirectReport }) && !hasPermission(auth, "payroll.structure.manage")) {
      return { ok: false as const, response: forbidden(c) };
    }
    return { ok: true as const, payslip: row.payslip, run: row.run };
  }

  app.get("/:id", async (c) => {
    const result = await loadOwnedPayslip(c, c.req.param("id"));
    if (!result.ok) return result.response;
    return ok(c, serializePayslip(result.payslip, result.run));
  });

  app.get("/:id/download-url", async (c) => {
    const auth = c.get("auth");
    const result = await loadOwnedPayslip(c, c.req.param("id"));
    if (!result.ok) return result.response;
    if (!result.payslip.r2ObjectKey) return fail(c, 404, "NOT_FOUND", "This payslip's PDF has not been generated yet.");

    // Defense in depth, same discipline as apps/document-service's download-url check.
    if (!objectKeyBelongsToTenant(result.payslip.r2ObjectKey, auth.tenantId)) return forbidden(c);

    const downloadUrl = await createPresignedGetUrl(c.env, result.payslip.r2ObjectKey);
    return ok(c, { downloadUrl, expiresIn: 900 });
  });

  return app;
}
