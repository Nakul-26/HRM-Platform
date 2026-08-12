import { Hono } from "hono";
import { eq, sql } from "drizzle-orm";
import { schema, withTenant } from "@hrm/db";
import { canUnscoped } from "@hrm/auth";
import { createInterviewSchema, hasPermission, submitInterviewFeedbackSchema, updateInterviewSchema } from "@hrm/types";
import type { Env } from "../env";
import { getDb } from "../db";
import { fail, forbidden, notFound, ok, okList } from "../lib/response";
import { countTotal, parsePagination, parseSort } from "../lib/pagination";

const { interviews } = schema;

export function interviewsRouter() {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);

    const parsed = createInterviewSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid interview payload", parsed.error.flatten());

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .insert(interviews)
        .values({ tenantId: auth.tenantId, candidateId: parsed.data.candidateId, interviewerId: parsed.data.interviewerId, scheduledAt: new Date(parsed.data.scheduledAt) })
        .returning(),
    );
    return ok(c, row, 201);
  });

  app.get("/", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);
    const { page, perPage, offset } = parsePagination(c);
    const sort = parseSort(c, { scheduled_at: interviews.scheduledAt }, interviews.scheduledAt);

    const candidateId = c.req.query("candidateId");
    const where = candidateId ? eq(interviews.candidateId, candidateId) : undefined;

    const { rows, total } = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, async (tx) => {
      const [rows, countRows] = await Promise.all([
        tx.select().from(interviews).where(where).orderBy(...sort).limit(perPage).offset(offset),
        tx.select({ count: sql<number>`count(*)::int` }).from(interviews).where(where),
      ]);
      return { rows, total: countTotal(countRows) };
    });

    return okList(c, rows, { page, perPage, total });
  });

  // Any authenticated employee can see interviews they're assigned to
  // conduct — this is what feeds the self-service "My Interviews" page.
  app.get("/me", async (c) => {
    const auth = c.get("auth");
    if (!auth.employeeId) return ok(c, []);

    const rows = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(interviews).where(eq(interviews.interviewerId, auth.employeeId as string)).orderBy(interviews.scheduledAt),
    );
    return ok(c, rows);
  });

  app.get("/:id", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");

    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx.select().from(interviews).where(eq(interviews.id, id)),
    );
    if (!row) return notFound(c, "Interview");

    const isAssignedInterviewer = row.interviewerId === auth.employeeId;
    if (!isAssignedInterviewer && !canUnscoped(auth, "recruitment.manage")) return forbidden(c);
    return ok(c, row);
  });

  app.patch("/:id", async (c) => {
    const auth = c.get("auth");
    if (!canUnscoped(auth, "recruitment.manage")) return forbidden(c);
    const id = c.req.param("id");

    const parsed = updateInterviewSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid interview payload", parsed.error.flatten());

    const { scheduledAt, ...rest } = parsed.data;
    const [row] = await withTenant(getDb(c.env.APP_DATABASE_URL), auth.tenantId, (tx) =>
      tx
        .update(interviews)
        .set({ ...rest, ...(scheduledAt ? { scheduledAt: new Date(scheduledAt) } : {}), updatedAt: new Date() })
        .where(eq(interviews.id, id))
        .returning(),
    );
    if (!row) return notFound(c, "Interview");
    return ok(c, row);
  });

  // The self-scoped permission from the Phase 4 plan: any employee assigned
  // as interviewer can record their own feedback, not just recruitment.manage
  // holders — HR retains override access for entering feedback on anyone's
  // behalf.
  app.patch("/:id/feedback", async (c) => {
    const auth = c.get("auth");
    const id = c.req.param("id");

    const parsed = submitInterviewFeedbackSchema.safeParse(await c.req.json());
    if (!parsed.success) return fail(c, 400, "VALIDATION_ERROR", "Invalid feedback payload", parsed.error.flatten());

    const db = getDb(c.env.APP_DATABASE_URL);
    const result = await withTenant(db, auth.tenantId, async (tx) => {
      const [existing] = await tx.select().from(interviews).where(eq(interviews.id, id));
      if (!existing) return { kind: "not_found" as const };

      const isAssignedInterviewer = existing.interviewerId === auth.employeeId;
      const allowed =
        hasPermission(auth, "recruitment.manage") ||
        (isAssignedInterviewer && hasPermission(auth, "recruitment.interview.conduct"));
      if (!allowed) return { kind: "forbidden" as const };

      const [row] = await tx
        .update(interviews)
        .set({ rating: parsed.data.rating, feedback: parsed.data.feedback, status: "completed", updatedAt: new Date() })
        .where(eq(interviews.id, id))
        .returning();
      return { kind: "updated" as const, row };
    });

    if (result.kind === "not_found") return notFound(c, "Interview");
    if (result.kind === "forbidden") return forbidden(c, "You are not assigned to conduct this interview.");
    return ok(c, result.row);
  });

  return app;
}
