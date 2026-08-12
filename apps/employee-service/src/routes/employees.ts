import { Hono } from "hono";
import { and, eq, or, sql } from "drizzle-orm";
import { recordAuditLog, schema, withTenant } from "@hrm/db";
import { can, canUnscoped } from "@hrm/auth";
import { hasPermission } from "@hrm/types";
import { createEmployeeDocumentSchema, createEmployeeSchema, updateEmployeeSchema, updateSelfEmployeeSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";
import { parseEmployeeCsv, importEmployeesFromCsv } from "../lib/csvImport";

const { employees, employeeDocuments } = schema;

const ALLOWED_STATUS = new Set(["active", "on_leave", "terminated"]);

export function employeesRouter() {
  const app = new Hono<{ Bindings: Env }>();

  // Org directory: any authenticated employee, non-sensitive fields only.
  // Registered before "/:id" so the literal segment wins the route match.
  app.get("/directory", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "employee.read")) return forbidden(c);

    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(
      c,
      { last_name: employees.lastName, first_name: employees.firstName },
      employees.lastName,
    );
    const departmentId = c.req.query("department_id");
    const where = departmentId ? eq(employees.departmentId, departmentId) : undefined;

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [rows, countRows] = await Promise.all([
        tx
          .select({
            id: employees.id,
            firstName: employees.firstName,
            lastName: employees.lastName,
            workEmail: employees.workEmail,
            phone: employees.phone,
            departmentId: employees.departmentId,
            designationId: employees.designationId,
            branchId: employees.branchId,
            status: employees.status,
          })
          .from(employees)
          .where(where)
          .orderBy(...sort)
          .limit(perPage)
          .offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(employees).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.get("/me", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "employee.read") || !auth.employeeId) return forbidden(c);

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(employees).where(eq(employees.id, auth.employeeId as string)),
    );
    if (!row) return notFound(c, "Employee");
    return ok(c, row);
  });

  app.patch("/me", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "employee.write") || !auth.employeeId) return forbidden(c);

    const parsed = updateSelfEmployeeSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid profile payload", parsed.error.flatten());
    if (Object.keys(parsed.data).length === 0) return fail(c, 400, "VALIDATION_ERROR", "No fields to update");

    const row = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [updated] = await tx
        .update(employees)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(employees.id, auth.employeeId as string))
        .returning();
      if (!updated) return undefined;
      await recordAuditLog(tx, {
        tenantId: auth.tenantId,
        actorId: auth.employeeId ?? null,
        action: "employee.updated",
        resourceType: "employee",
        resourceId: updated.id,
        after: updated,
        ipAddress: c.req.header("cf-connecting-ip") ?? null,
      });
      return updated;
    });
    if (!row) return notFound(c, "Employee");
    return ok(c, row);
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const canReadAll = hasPermission(auth, "employee.read_all");
    if (!canReadAll && !canUnscoped(auth, "employee.read")) return forbidden(c);

    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(
      c,
      { created_at: employees.createdAt, last_name: employees.lastName },
      employees.lastName,
    );

    const departmentId = c.req.query("department_id");
    const status = c.req.query("status");
    const filters = [
      departmentId ? eq(employees.departmentId, departmentId) : undefined,
      status && ALLOWED_STATUS.has(status) ? eq(employees.status, status) : undefined,
      // Without the `_all` permission, results are restricted to the
      // caller's own record and their direct reports (docs/architecture/06-security.md).
      !canReadAll && auth.employeeId
        ? or(eq(employees.id, auth.employeeId), eq(employees.managerId, auth.employeeId))
        : undefined,
      !canReadAll && !auth.employeeId ? sql`false` : undefined,
    ].filter((clause): clause is NonNullable<typeof clause> => clause !== undefined);
    const where = filters.length > 0 ? and(...filters) : undefined;

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [rows, countRows] = await Promise.all([
        tx.select().from(employees).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(employees).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) => tx.select().from(employees).where(eq(employees.id, id)));
    if (!row) return notFound(c, "Employee");

    const ownership = { isSelf: row.id === auth.employeeId, isDirectReport: row.managerId === auth.employeeId };
    if (!can(auth, "employee.read", ownership)) return forbidden(c);

    return ok(c, row);
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "employee.write_all")) return forbidden(c);

    const parsed = createEmployeeSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid employee payload", parsed.error.flatten());

    try {
      const row = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
        const [inserted] = await tx
          .insert(employees)
          .values({ tenantId: auth.tenantId, status: "active", ...parsed.data })
          .returning();
        await recordAuditLog(tx, {
          tenantId: auth.tenantId,
          actorId: auth.employeeId ?? null,
          action: "employee.created",
          resourceType: "employee",
          resourceId: inserted?.id ?? null,
          after: inserted,
          ipAddress: c.req.header("cf-connecting-ip") ?? null,
        });
        return inserted;
      });
      return ok(c, row, 201);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return fail(c, 409, "EMPLOYEE_CODE_CONFLICT", "An employee with this employee_code already exists.");
      }
      throw err;
    }
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "employee.write_all")) return forbidden(c);
    const id = c.req.param("id");

    const parsed = updateEmployeeSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid employee payload", parsed.error.flatten());
    if (Object.keys(parsed.data).length === 0) return fail(c, 400, "VALIDATION_ERROR", "No fields to update");

    try {
      const row = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
        const [updated] = await tx
          .update(employees)
          .set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(employees.id, id))
          .returning();
        if (!updated) return undefined;
        await recordAuditLog(tx, {
          tenantId: auth.tenantId,
          actorId: auth.employeeId ?? null,
          action: "employee.updated",
          resourceType: "employee",
          resourceId: updated.id,
          after: updated,
          ipAddress: c.req.header("cf-connecting-ip") ?? null,
        });
        return updated;
      });
      if (!row) return notFound(c, "Employee");
      return ok(c, row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        return fail(c, 409, "EMPLOYEE_CODE_CONFLICT", "An employee with this employee_code already exists.");
      }
      throw err;
    }
  });

  // Modeled as an action endpoint, not a bare DELETE, because "terminated" is
  // a business state transition with its own permission
  // (docs/architecture/05-api-design.md).
  app.delete("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "employee.terminate")) return forbidden(c);
    const id = c.req.param("id");

    const [existing] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) => tx.select().from(employees).where(eq(employees.id, id)));
    if (!existing) return notFound(c, "Employee");
    if (existing.status === "terminated") {
      return fail(c, 409, "ALREADY_TERMINATED", "This employee has already been terminated.");
    }

    const today = new Date().toISOString().slice(0, 10);
    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .update(employees)
        .set({ status: "terminated", dateOfExit: today, updatedAt: new Date() })
        .where(eq(employees.id, id))
        .returning(),
    );
    return ok(c, row);
  });

  // Document metadata (docs/architecture/01-services-and-communication.md:
  // "Document service" issues the presigned URL, this service records what
  // was uploaded against the employee it belongs to). `objectKey` is trusted
  // as opaque — apps/document-service is what enforces the tenant prefix on it.
  app.get("/:id/documents", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const db = getDb(c.env.APP_DATABASE_URL);

    const [employee] = await withTenant(db, auth.tenantId, (tx) => tx.select().from(employees).where(eq(employees.id, id)));
    if (!employee) return notFound(c, "Employee");
    const ownership = { isSelf: employee.id === auth.employeeId, isDirectReport: employee.managerId === auth.employeeId };
    if (!can(auth, "employee.read", ownership)) return forbidden(c);

    const rows = await withTenant(db, auth.tenantId, (tx) =>
      tx.select().from(employeeDocuments).where(eq(employeeDocuments.employeeId, id)),
    );
    return ok(c, rows);
  });

  app.post("/:id/documents", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const db = getDb(c.env.APP_DATABASE_URL);

    const [employee] = await withTenant(db, auth.tenantId, (tx) => tx.select().from(employees).where(eq(employees.id, id)));
    if (!employee) return notFound(c, "Employee");
    // isDirectReport is deliberately not passed through here: a manager
    // shouldn't get to attach documents to a report's file just by holding
    // the base (non-`_all`) permission — only the employee themselves (self-
    // upload) or an org-wide `employee.write_all` holder can.
    const ownership = { isSelf: employee.id === auth.employeeId, isDirectReport: false };
    if (!can(auth, "employee.write", ownership)) return forbidden(c);

    const parsed = createEmployeeDocumentSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid document payload", parsed.error.flatten());

    const row = await withTenant(db, auth.tenantId, async (tx) => {
      const [row] = await tx
        .insert(employeeDocuments)
        .values({
          tenantId: auth.tenantId,
          employeeId: id,
          documentType: parsed.data.documentType,
          r2ObjectKey: parsed.data.objectKey,
          uploadedBy: auth.employeeId,
        })
        .returning();
      await recordAuditLog(tx, {
        tenantId: auth.tenantId,
        actorId: auth.employeeId ?? null,
        action: "document.uploaded",
        resourceType: "employee_document",
        resourceId: row?.id ?? null,
        after: row,
        ipAddress: c.req.header("cf-connecting-ip") ?? null,
      });
      return row;
    });
    return ok(c, row, 201);
  });

  // Bulk onboarding (docs/architecture/10-roadmap.md, Phase 1). Org-wide
  // write only — the same permission bar as creating a single employee.
  app.post("/import", async (c) => {
    const auth = c.get("auth");
    if (!hasPermission(auth, "employee.write_all")) return forbidden(c);

    const csvText = await c.req.text();
    if (!csvText.trim()) return fail(c, 400, "VALIDATION_ERROR", "Request body is empty; expected CSV text.");

    const { rows, errors: parseErrors } = parseEmployeeCsv(csvText);
    if (parseErrors.length > 0) {
      return fail(c, 422, "CSV_VALIDATION_FAILED", "One or more rows failed validation; nothing was imported.", {
        errors: parseErrors,
      });
    }

    const result = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) => importEmployeesFromCsv(tx, auth.tenantId, rows));
    if (result.errors.length > 0) {
      return fail(c, 422, "CSV_VALIDATION_FAILED", "One or more rows failed validation; nothing was imported.", {
        errors: result.errors,
      });
    }

    return ok(c, { imported: result.imported }, 201);
  });

  return app;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code: unknown }).code === "23505";
}
