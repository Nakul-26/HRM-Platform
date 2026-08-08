import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

/** Envelope shapes from docs/architecture/05-api-design.md. */

export function ok<T>(c: Context, data: T, status: ContentfulStatusCode = 200) {
  return c.json({ data, requestId: c.get("requestId") }, status);
}

export function fail(c: Context, status: ContentfulStatusCode, code: string, message: string, details?: unknown) {
  return c.json({ error: { code, message, details }, requestId: c.get("requestId") }, status);
}
