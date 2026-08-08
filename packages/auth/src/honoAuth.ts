import type { MiddlewareHandler } from "hono";
import type { AuthContext } from "@hrm/types";
import { verifyAccessToken } from "./jwt";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
    requestId: string;
  }
}

export interface AuthMiddlewareEnv {
  JWT_SIGNING_KEY: string;
  JWT_KID: string;
}

/**
 * Resolves `{ tenantId, employeeId, roleId, roleName, permissions }` once, at
 * the Gateway, and every downstream service trusts the forwarded,
 * already-signed context without re-querying Identity per request
 * (docs/architecture/06-security.md, "API security"). Shared here (rather
 * than duplicated per service) because every Workers service downstream of
 * the Gateway needs byte-identical verification behavior.
 */
export function jwtAuth<Env extends AuthMiddlewareEnv>(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json(
        { error: { code: "UNAUTHENTICATED", message: "Missing bearer token" }, requestId: c.get("requestId") },
        401,
      );
    }

    const token = authHeader.slice("Bearer ".length);
    try {
      const auth = await verifyAccessToken(token, {
        signingKey: c.env.JWT_SIGNING_KEY,
        kid: c.env.JWT_KID,
      });

      // TODO(Phase 1): once tenant-service exposes a slug->id lookup (cached
      // at the edge), reject here if `auth.tenantId` doesn't match the
      // tenant resolved from the subdomain — defense in depth so a token
      // minted for tenant A presented against tenant B's subdomain never
      // reaches a downstream service or RLS at all.

      c.set("auth", auth);
      await next();
    } catch {
      return c.json(
        { error: { code: "INVALID_TOKEN", message: "Token is invalid or expired" }, requestId: c.get("requestId") },
        401,
      );
    }
  };
}
