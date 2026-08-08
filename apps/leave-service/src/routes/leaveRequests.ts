import { Hono, type Context } from "hono";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { schema, withTenant, type Database } from "@hrm/db";
import { can, canUnscoped } from "@hrm/auth";
import { applyLeaveSchema, hasPermission, leaveDecisionSchema, type AuthContext, type LeaveRequest } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";
import { calculateLeaveDays } from "../lib/leaveDays";

const { leaveRequests, leaveTypes, leaveBalances, employees, holidayCalendar } = schema;

type AppContext = Context<{ Bindings: Env }>;

function serializeRequest(row: typeof leaveRequests.$inferSelect): LeaveRequest {
  return {
    ...row,
    days: Number(row.days),
    status: row.status as LeaveRequest["status"],
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
  };
}

/** Rows the caller may see: org-wide (`null`) if `leave.approve_all`, else self + direct reports if `leave.approve`, else self only. */
async function resolveVisibleEmployeeIds(tx: Database, auth: AuthContext): Promise<string[] | null> {
  if (hasPermission(auth, "leave.approve_all")) return null;

  const ids: string[] = [];
  if (auth.employeeId) {
    ids.push(auth.employeeId);
    if (canUnscoped(auth, "leave.approve")) {
      const reports = await tx.select({ id: employees.id }).from(employees).where(eq(employees.managerId, auth.employeeId));
      ids.push(...reports.map((r) => r.id));
    }
  }
  return ids;
}

async function decide(c: AppContext, targetStatus: "approved" | "rejected") {
  const auth = c.get("auth");
  // A generic Context (shared by both /approve and /reject) can't infer the
  // ":id" param's literal type the way an inline `app.patch("/:id/...")`
  // handler can — it's always present at runtime since both routes declare it.
  const id = c.req.param("id") as string;
  if (!auth.employeeId) return forbidden(c);

  const parsed = leaveDecisionSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid decision payload", parsed.error.flatten());

  const employeeId = auth.employeeId;
  const db = getDb(c.env.APP_DATABASE_URL);
  const result = await withTenant(db, auth.tenantId, async (tx) => {
    const [existing] = await tx
      .select({ request: leaveRequests, managerId: employees.managerId })
      .from(leaveRequests)
      .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
      .where(eq(leaveRequests.id, id));
    if (!existing) return { error: "NOT_FOUND" as const };

    const ownership = { isSelf: existing.request.employeeId === employeeId, isDirectReport: existing.managerId === employeeId };
    if (!can(auth, "leave.approve", ownership)) return { error: "FORBIDDEN" as const };
    if (existing.request.status !== "pending") {
      return { error: "INVALID_TRANSITION" as const, status: existing.request.status };
    }

    // Re-check balance sufficiency here, not just at apply time: applying
    // never reserves balance against other still-pending requests, so two
    // pending requests can each individually fit the balance at apply time
    // yet together exceed it. This is the check that actually prevents an
    // overrun — apply-time is only a courtesy/early rejection.
    let balanceKey;
    if (targetStatus === "approved") {
      const [leaveType] = await tx.select().from(leaveTypes).where(eq(leaveTypes.id, existing.request.leaveTypeId));
      const year = new Date(`${existing.request.startDate}T00:00:00Z`).getUTCFullYear();
      balanceKey = and(
        eq(leaveBalances.tenantId, auth.tenantId),
        eq(leaveBalances.employeeId, existing.request.employeeId),
        eq(leaveBalances.leaveTypeId, existing.request.leaveTypeId),
        eq(leaveBalances.year, year),
      );

      if (leaveType?.isPaid) {
        const [balance] = await tx.select().from(leaveBalances).where(balanceKey);
        const available = balance
          ? Number(balance.entitled) + Number(balance.carriedForward) - Number(balance.used)
          : 0;
        if (Number(existing.request.days) > available) {
          return { error: "INSUFFICIENT_BALANCE" as const, available };
        }
      }
    }

    const [row] = await tx
      .update(leaveRequests)
      .set({
        status: targetStatus,
        approverId: employeeId,
        decidedAt: new Date(),
        decisionNote: parsed.data.reason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(leaveRequests.id, id))
      .returning();

    if (targetStatus === "approved" && balanceKey) {
      const [balance] = await tx.select().from(leaveBalances).where(balanceKey);
      if (balance) {
        await tx
          .update(leaveBalances)
          .set({ used: String(Number(balance.used) + Number(existing.request.days)) })
          .where(balanceKey);
      } else {
        await tx.insert(leaveBalances).values({
          tenantId: auth.tenantId,
          employeeId: existing.request.employeeId,
          leaveTypeId: existing.request.leaveTypeId,
          year: new Date(`${existing.request.startDate}T00:00:00Z`).getUTCFullYear(),
          used: String(existing.request.days),
        });
      }
    }

    return { row: row! };
  });

  if ("error" in result) {
    if (result.error === "NOT_FOUND") return notFound(c, "Leave request");
    if (result.error === "FORBIDDEN") return forbidden(c);
    if (result.error === "INSUFFICIENT_BALANCE") {
      return fail(c, 409, "INSUFFICIENT_BALANCE", `Approving would exceed the employee's balance (available: ${result.available}).`);
    }
    return fail(c, 409, "INVALID_TRANSITION", `Cannot decide a request that is already ${result.status}.`);
  }
  return ok(c, serializeRequest(result.row));
}

export function leaveRequestsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "leave.apply") || !auth.employeeId) return forbidden(c);

    const parsed = applyLeaveSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid leave request payload", parsed.error.flatten());
    const { leaveTypeId, startDate, endDate, reason } = parsed.data;

    if (endDate < startDate) return fail(c, 400, "VALIDATION_ERROR", "endDate must not be before startDate");
    const startYear = new Date(`${startDate}T00:00:00Z`).getUTCFullYear();
    const endYear = new Date(`${endDate}T00:00:00Z`).getUTCFullYear();
    if (startYear !== endYear) return fail(c, 400, "VALIDATION_ERROR", "Leave requests cannot span multiple years");

    const employeeId = auth.employeeId;
    const db = getDb(c.env.APP_DATABASE_URL);
    const result = await withTenant(db, auth.tenantId, async (tx) => {
      const [leaveType] = await tx.select().from(leaveTypes).where(eq(leaveTypes.id, leaveTypeId));
      if (!leaveType) return { error: "LEAVE_TYPE_NOT_FOUND" as const };

      const holidays = await tx
        .select({ date: holidayCalendar.date })
        .from(holidayCalendar)
        .where(and(gte(holidayCalendar.date, startDate), lte(holidayCalendar.date, endDate)));

      const days = calculateLeaveDays(startDate, endDate, holidays);
      if (days <= 0) return { error: "NO_WORKING_DAYS" as const };

      if (leaveType.isPaid) {
        const [balance] = await tx
          .select()
          .from(leaveBalances)
          .where(
            and(
              eq(leaveBalances.employeeId, employeeId),
              eq(leaveBalances.leaveTypeId, leaveTypeId),
              eq(leaveBalances.year, startYear),
            ),
          );
        const available = balance
          ? Number(balance.entitled) + Number(balance.carriedForward) - Number(balance.used)
          : 0;
        if (days > available) return { error: "INSUFFICIENT_BALANCE" as const, available };
      }

      const [row] = await tx
        .insert(leaveRequests)
        .values({
          tenantId: auth.tenantId,
          employeeId,
          leaveTypeId,
          startDate,
          endDate,
          days: String(days),
          reason: reason ?? null,
          status: "pending",
        })
        .returning();
      return { row: row! };
    });

    if ("error" in result) {
      if (result.error === "LEAVE_TYPE_NOT_FOUND") return notFound(c, "Leave type");
      if (result.error === "NO_WORKING_DAYS") {
        return fail(c, 400, "VALIDATION_ERROR", "The selected range has no working days.");
      }
      return fail(c, 400, "INSUFFICIENT_BALANCE", `Insufficient leave balance (available: ${result.available}).`);
    }
    return ok(c, serializeRequest(result.row), 201);
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { start_date: leaveRequests.startDate, created_at: leaveRequests.createdAt }, leaveRequests.startDate);
    const status = c.req.query("status");

    const db = getDb(c.env.APP_DATABASE_URL);
    const { rows, total } = await withTenant(db, auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      const filters = [
        status ? eq(leaveRequests.status, status) : undefined,
        visibleIds === null ? undefined : visibleIds.length > 0 ? inArray(leaveRequests.employeeId, visibleIds) : sql`false`,
      ].filter((clause): clause is NonNullable<typeof clause> => clause !== undefined);
      const where = filters.length > 0 ? and(...filters) : undefined;

      const [rows, countRows] = await Promise.all([
        tx.select().from(leaveRequests).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(leaveRequests).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows.map(serializeRequest), { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const db = getDb(c.env.APP_DATABASE_URL);

    const [row] = await withTenant(db, auth.tenantId, (tx) =>
      tx
        .select({ request: leaveRequests, managerId: employees.managerId })
        .from(leaveRequests)
        .innerJoin(employees, eq(leaveRequests.employeeId, employees.id))
        .where(eq(leaveRequests.id, id)),
    );
    if (!row) return notFound(c, "Leave request");

    const isSelf = row.request.employeeId === auth.employeeId;
    const ownership = { isSelf, isDirectReport: row.managerId === auth.employeeId };
    if (!isSelf && !can(auth, "leave.approve", ownership)) return forbidden(c);

    return ok(c, serializeRequest(row.request));
  });

  // Self-only, and only while still pending — once decided, only an
  // approver acting through /approve or /reject can change its state.
  app.patch("/:id/cancel", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const db = getDb(c.env.APP_DATABASE_URL);

    const result = await withTenant(db, auth.tenantId, async (tx) => {
      const [existing] = await tx.select().from(leaveRequests).where(eq(leaveRequests.id, id));
      if (!existing) return { error: "NOT_FOUND" as const };
      if (existing.employeeId !== auth.employeeId) return { error: "FORBIDDEN" as const };
      if (existing.status !== "pending") return { error: "INVALID_TRANSITION" as const, status: existing.status };

      const [row] = await tx
        .update(leaveRequests)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(leaveRequests.id, id))
        .returning();
      return { row: row! };
    });

    if ("error" in result) {
      if (result.error === "NOT_FOUND") return notFound(c, "Leave request");
      if (result.error === "FORBIDDEN") return forbidden(c, "You can only cancel your own leave requests.");
      return fail(c, 409, "INVALID_TRANSITION", `Cannot cancel a request that is already ${result.status}.`);
    }
    return ok(c, serializeRequest(result.row));
  });

  app.patch("/:id/approve", (c) => decide(c, "approved"));
  app.patch("/:id/reject", (c) => decide(c, "rejected"));

  return app;
}
