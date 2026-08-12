import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Envelope shapes from docs/architecture/05-api-design.md. */

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ data, requestId: c.get("requestId") }, status);
}

export function okList<T>(
  c: Context,
  data: T[],
  pagination: { page: number; perPage: number; total: number },
) {
  return c.json(
    {
      data,
      meta: {
        requestId: c.get("requestId"),
        pagination: {
          page: pagination.page,
          pageSize: pagination.perPage,
          totalItems: pagination.total,
          totalPages: Math.ceil(pagination.total / pagination.perPage) || 1,
        },
      },
    },
    200,
  );
}

export function fail(c: Context, status: ContentfulStatusCode, code: string, message: string, details?: unknown) {
  return c.json({ error: { code, message, details }, requestId: c.get("requestId") }, status);
}

export const forbidden = (c: Context, message = "You do not have permission to perform this action.") =>
  fail(c, 403, "FORBIDDEN", message);

export const notFound = (c: Context, resource: string) =>
  fail(c, 404, "NOT_FOUND", `${resource} not found.`);
