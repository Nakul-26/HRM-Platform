import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { AuthContext } from "@hrm/types";

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 min — docs/architecture/06-security.md

export interface JwtConfig {
  signingKey: string;
  kid: string;
}

/**
 * Signs the internal, downstream-trusted identity claims resolved once at
 * the Gateway. Carries `kid` so a signing-key rotation has a verifiable
 * window instead of invalidating every active token at once — see
 * docs/architecture/06-security.md, "Secrets management".
 */
export async function signAccessToken(ctx: AuthContext, config: JwtConfig): Promise<string> {
  const key = new TextEncoder().encode(config.signingKey);
  return new SignJWT({ ...ctx } satisfies JWTPayload & AuthContext)
    .setProtectedHeader({ alg: "HS256", kid: config.kid })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(key);
}

/**
 * Verifies against a single active key for now. When rotation is
 * implemented, resolve `config` by the token's unverified `kid` header
 * against a {kid -> key} map before calling this, so tokens signed with the
 * previous key still verify during the rotation window.
 */
export async function verifyAccessToken(token: string, config: JwtConfig): Promise<AuthContext> {
  const key = new TextEncoder().encode(config.signingKey);
  const { payload } = await jwtVerify(token, key);
  return payload as unknown as AuthContext;
}
