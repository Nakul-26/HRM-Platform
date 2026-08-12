import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { schema, withTenant, type Database } from "@hrm/db";
import { hasPermission } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { forbidden, ok } from "../lib/response";
import { toCsv } from "../lib/csv";

const { payrollRuns, payslips } = schema;

async function loadSummary(tx: Database) {
  return tx
    .select({
      payrollRunId: payslips.payrollRunId,
      periodMonth: payrollRuns.periodMonth,
      periodYear: payrollRuns.periodYear,
      status: payrollRuns.status,
      headcountPaid: sql<number>`count(*)::int`,
      grossEarnings: sql<string>`coalesce(sum(${payslips.grossEarnings}), 0)`,
      totalDeductions: sql<string>`coalesce(sum(${payslips.totalDeductions}), 0)`,
      netPay: sql<string>`coalesce(sum(${payslips.netPay}), 0)`,
    })
    .from(payslips)
    .innerJoin(payrollRuns, eq(payslips.payrollRunId, payrollRuns.id))
    .groupBy(payslips.payrollRunId, payrollRuns.periodMonth, payrollRuns.periodYear, payrollRuns.status)
    .orderBy(payrollRuns.periodYear, payrollRuns.periodMonth);
}

export function payrollSummaryRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "reporting.view_all")) return forbidden(c);

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) => loadSummary(tx));
    return ok(c, rows);
  });

  app.get("/export", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "reporting.view_all")) return forbidden(c);

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) => loadSummary(tx));

    const csv = toCsv(rows, [
      { key: "periodYear", header: "Year" },
      { key: "periodMonth", header: "Month" },
      { key: "status", header: "Status" },
      { key: "headcountPaid", header: "Headcount Paid" },
      { key: "grossEarnings", header: "Gross Earnings" },
      { key: "totalDeductions", header: "Total Deductions" },
      { key: "netPay", header: "Net Pay" },
    ]);

    return new Response(csv, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": "attachment; filename=payroll-summary.csv" },
    });
  });

  return app;
}
