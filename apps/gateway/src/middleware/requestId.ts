import type { MiddlewareHandler } from "hono";

declare module "hono" {
  interface ContextVariableMap {
    requestId: string;
  }
}

/**
 * Every response carries a requestId (docs/architecture/05-api-design.md),
 * propagated across the whole Gateway -> service -> queue-consumer chain via
 * the `x-request-id` header so a single request is traceable end to end.
 */
export const requestId: MiddlewareHandler = async (c, next) => {
  const id = c.req.header("x-request-id") ?? crypto.randomUUID();
  c.set("requestId", id);
  c.header("x-request-id", id);
  await next();
};
