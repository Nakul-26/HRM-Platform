import { Hono } from "hono";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { recordAuditLog, schema, withTenant, type Database } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createPayrollRunSchema, hasPermission, type Payslip } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";
import { resolveActiveSalaryStructure } from "../lib/activeSalaryStructure";
import { calculatePayslip, periodBounds, toPayComponentType, toPayrollTaxConfig } from "../lib/payrollEngine";
import { generatePayslipPdf } from "../lib/payslipPdf";
import { buildPayslipObjectKey } from "../lib/objectKey";
import { putObject } from "../lib/s3";

const { payrollRuns, payslips, payComponentTypes, payrollTaxConfig, employees, tenants, notifications } = schema;

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

async function processRun(tx: Database, env: Env, tenantId: string, run: typeof payrollRuns.$inferSelect) {
  const { startDate, endDate } = periodBounds(run.periodYear, run.periodMonth);

  const [tenant] = await tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));
  const [taxConfigRow] = await tx.select().from(payrollTaxConfig).where(eq(payrollTaxConfig.tenantId, tenantId));
  if (!tenant || !taxConfigRow) throw new Error("Tenant or payroll tax config not found — cannot process run.");
  const taxConfig = toPayrollTaxConfig(taxConfigRow);

  const componentTypeRows = await tx.select().from(payComponentTypes).where(and(eq(payComponentTypes.tenantId, tenantId), isNull(payComponentTypes.deletedAt)));
  const componentTypes = componentTypeRows.map(toPayComponentType);

  // Employed for at least part of the period — includes employees already
  // marked `terminated` whose `dateOfExit` falls inside this period (their
  // final settlement), not just currently-`active` employees.
  const employeeRows = await tx
    .select()
    .from(employees)
    .where(
      and(
        eq(employees.tenantId, tenantId),
        sql`${employees.dateOfJoining} <= ${endDate}`,
        sql`(${employees.dateOfExit} IS NULL OR ${employees.dateOfExit} >= ${startDate})`,
      ),
    );

  for (const employee of employeeRows) {
    const structure = await resolveActiveSalaryStructure(tx, tenantId, employee.id, endDate);
    if (!structure) continue; // no salary structure yet — skipped, not failed

    const result = await calculatePayslip(
      tx,
      tenantId,
      { id: employee.id, branchId: employee.branchId, dateOfExit: employee.dateOfExit },
      structure,
      componentTypes,
      taxConfig,
      run.periodMonth,
      run.periodYear,
    );

    const [payslip] = await tx
      .insert(payslips)
      .values({
        tenantId,
        payrollRunId: run.id,
        employeeId: employee.id,
        grossEarnings: String(result.grossEarnings),
        totalDeductions: String(result.totalDeductions),
        netPay: String(result.netPay),
        breakdown: result.breakdown,
      })
      .onConflictDoUpdate({
        target: [payslips.tenantId, payslips.payrollRunId, payslips.employeeId],
        set: {
          grossEarnings: String(result.grossEarnings),
          totalDeductions: String(result.totalDeductions),
          netPay: String(result.netPay),
          breakdown: result.breakdown,
          updatedAt: new Date(),
        },
      })
      .returning();
    if (!payslip) continue;

    const pdfBytes = await generatePayslipPdf({
      tenantName: tenant.name,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      employeeCode: employee.employeeCode,
      periodMonth: run.periodMonth,
      periodYear: run.periodYear,
      grossEarnings: result.grossEarnings,
      totalDeductions: result.totalDeductions,
      netPay: result.netPay,
      breakdown: result.breakdown,
    });
    const objectKey = buildPayslipObjectKey(tenantId, run.id, employee.id);
    await putObject(env, objectKey, "application/pdf", pdfBytes);
    await tx.update(payslips).set({ r2ObjectKey: objectKey }).where(eq(payslips.id, payslip.id));

    await tx.insert(notifications).values({
      tenantId,
      recipientId: employee.id,
      channel: "in_app",
      templateKey: "payslip_ready",
    });
  }
}

export function runsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "payroll.run")) return forbidden(c);

    const parsed = createPayrollRunSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid payroll run payload", parsed.error.flatten());

    const db = getDb(c.env.APP_DATABASE_URL);
    const run = await withTenant(db, auth.tenantId, async (tx) => {
      const [inserted] = await tx
        .insert(payrollRuns)
        .values({ tenantId: auth.tenantId, ...parsed.data })
        .onConflictDoNothing({ target: [payrollRuns.tenantId, payrollRuns.periodMonth, payrollRuns.periodYear] })
        .returning();
      if (inserted) {
        await recordAuditLog(tx, {
          tenantId: auth.tenantId,
          actorId: auth.employeeId ?? null,
          action: "payroll_run.triggered",
          resourceType: "payroll_run",
          resourceId: inserted.id,
          after: inserted,
          ipAddress: c.req.header("cf-connecting-ip") ?? null,
        });
        return inserted;
      }

      // Already exists for this period — return the existing run rather than a conflict error, so re-posting the same period is a safe no-op at creation time too.
      const [existing] = await tx
        .select()
        .from(payrollRuns)
        .where(and(eq(payrollRuns.tenantId, auth.tenantId), eq(payrollRuns.periodMonth, parsed.data.periodMonth), eq(payrollRuns.periodYear, parsed.data.periodYear)));
      return existing;
    });
    if (!run) return fail(c, 500, "INTERNAL_ERROR", "Failed to create payroll run");
    return ok(c, run, 201);
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "payroll.view_all")) return forbidden(c);
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { period_year: payrollRuns.periodYear }, payrollRuns.periodYear);

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [rows, countRows] = await Promise.all([
        tx.select().from(payrollRuns).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(payrollRuns),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "payroll.view_all")) return forbidden(c);
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(payrollRuns).where(and(eq(payrollRuns.id, id), eq(payrollRuns.tenantId, auth.tenantId))),
    );
    if (!row) return notFound(c, "Payroll run");
    return ok(c, row);
  });

  app.get("/:id/payslips", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "payroll.view_all")) return forbidden(c);
    const id = c.req.param("id");

    const { run, rows } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [run] = await tx.select().from(payrollRuns).where(and(eq(payrollRuns.id, id), eq(payrollRuns.tenantId, auth.tenantId)));
      const rows = run ? await tx.select().from(payslips).where(and(eq(payslips.payrollRunId, id), eq(payslips.tenantId, auth.tenantId))) : [];
      return { run, rows };
    });
    if (!run) return notFound(c, "Payroll run");
    return ok(c, rows.map((row) => serializePayslip(row, run)));
  });

  // The idempotency-critical action: an atomic "processing" claim guards
  // against concurrent executes (only one caller ever wins it), and
  // re-executing an already-`completed` run is a safe no-op that returns
  // the existing payslips unchanged rather than recomputing anything. A
  // thrown error mid-run rolls the whole transaction back (including the
  // claim itself) — no half-completed run is ever visible — and a
  // follow-up update outside that transaction marks it `failed` so it's
  // retriable (see docs/architecture/10-roadmap.md's Phase 3 DoD).
  app.post("/:id/execute", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "payroll.run")) return forbidden(c);
    const id = c.req.param("id");
    const db = getDb(c.env.APP_DATABASE_URL);

    let result: { kind: "not_found" } | { kind: "in_progress" } | { kind: "done"; run: typeof payrollRuns.$inferSelect };
    try {
      result = await withTenant(db, auth.tenantId, async (tx) => {
        const [claimed] = await tx
          .update(payrollRuns)
          .set({ status: "processing" })
          .where(and(eq(payrollRuns.id, id), eq(payrollRuns.tenantId, auth.tenantId), inArray(payrollRuns.status, ["draft", "failed"])))
          .returning();

        if (!claimed) {
          const [existing] = await tx.select().from(payrollRuns).where(and(eq(payrollRuns.id, id), eq(payrollRuns.tenantId, auth.tenantId)));
          if (!existing) return { kind: "not_found" as const };
          if (existing.status === "completed") return { kind: "done" as const, run: existing };
          return { kind: "in_progress" as const };
        }

        await processRun(tx, c.env, auth.tenantId, claimed);

        const [completed] = await tx
          .update(payrollRuns)
          .set({ status: "completed", processedAt: new Date() })
          .where(eq(payrollRuns.id, id))
          .returning();
        if (!completed) throw new Error("Failed to mark payroll run completed");
        await recordAuditLog(tx, {
          tenantId: auth.tenantId,
          actorId: auth.employeeId ?? null,
          action: "payroll_run.executed",
          resourceType: "payroll_run",
          resourceId: completed.id,
          after: completed,
          ipAddress: c.req.header("cf-connecting-ip") ?? null,
        });
        return { kind: "done" as const, run: completed };
      });
    } catch (err) {
      await withTenant(db, auth.tenantId, (tx) =>
        tx.update(payrollRuns).set({ status: "failed" }).where(and(eq(payrollRuns.id, id), eq(payrollRuns.tenantId, auth.tenantId))),
      );
      throw err;
    }

    if (result.kind === "not_found") return notFound(c, "Payroll run");
    if (result.kind === "in_progress") return fail(c, 409, "RUN_IN_PROGRESS", "This payroll run is already being processed.");

    const payslipRows = await withTenant(db, auth.tenantId, (tx) =>
      tx.select().from(payslips).where(and(eq(payslips.payrollRunId, id), eq(payslips.tenantId, auth.tenantId))),
    );
    return ok(c, { run: result.run, payslips: payslipRows.map((row) => serializePayslip(row, result.run)) });
  });

  return app;
}
