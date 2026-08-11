import { Hono } from "hono";
import { eq, inArray, sql } from "drizzle-orm";
import { schema, withTenant } from "@hrm/db";
import { can, canUnscoped } from "@hrm/auth";
import { createSalaryStructureSchema, hasPermission } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";
import { resolveActiveSalaryStructure } from "../lib/activeSalaryStructure";
import { resolveVisibleEmployeeIds } from "../lib/visibility";

const { salaryStructures, employees } = schema;

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function salaryStructuresRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.get("/me", async (c) => {
    const auth = c.get("auth");
    if (!auth.employeeId) return forbidden(c);

    const structure = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      resolveActiveSalaryStructure(tx, auth.tenantId, auth.employeeId as string, todayDateString()),
    );
    return ok(c, structure);
  });

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "payroll.structure.manage")) return forbidden(c);

    const parsed = createSalaryStructureSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid salary structure payload", parsed.error.flatten());

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.insert(salaryStructures).values({ tenantId: auth.tenantId, ...parsed.data }).returning(),
    );
    return ok(c, row, 201);
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { effective_from: salaryStructures.effectiveFrom }, salaryStructures.effectiveFrom);

    const db = getDb(c.env.APP_DATABASE_URL);
    const { rows, total } = await withTenant(db, auth.tenantId, async (tx) => {
      const visibleIds = await resolveVisibleEmployeeIds(tx, auth);
      const where = visibleIds === null ? undefined : visibleIds.length > 0 ? inArray(salaryStructures.employeeId, visibleIds) : sql`false`;

      const [rows, countRows] = await Promise.all([
        tx.select().from(salaryStructures).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(salaryStructures).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");
    const db = getDb(c.env.APP_DATABASE_URL);

    const [row] = await withTenant(db, auth.tenantId, (tx) =>
      tx
        .select({ structure: salaryStructures, managerId: employees.managerId })
        .from(salaryStructures)
        .innerJoin(employees, eq(salaryStructures.employeeId, employees.id))
        .where(eq(salaryStructures.id, id)),
    );
    if (!row) return notFound(c, "Salary structure");

    const isSelf = row.structure.employeeId === auth.employeeId;
    const isDirectReport = row.managerId === auth.employeeId;
    if (!can(auth, "payroll.view", { isSelf, isDirectReport }) && !hasPermission(auth, "payroll.structure.manage")) {
      return forbidden(c);
    }

    return ok(c, row.structure);
  });

  return app;
}
