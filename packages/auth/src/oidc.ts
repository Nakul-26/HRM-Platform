import { createRemoteJWKSet, jwtVerify } from "jose";

export interface OidcConnectionEndpoints {
  issuer: string;
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

export interface DiscoveredOidcEndpoints {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

/** Run once, at connection-setup time, so login doesn't pay a discovery round trip. */
export async function discoverOidcEndpoints(issuer: string): Promise<DiscoveredOidcEndpoints> {
  const wellKnownUrl = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const res = await fetch(wellKnownUrl);
  if (!res.ok) throw new Error(`OIDC discovery failed for ${issuer}: HTTP ${res.status}`);

  const config = (await res.json()) as Record<string, unknown>;
  const authorizationEndpoint = config.authorization_endpoint;
  const tokenEndpoint = config.token_endpoint;
  const jwksUri = config.jwks_uri;
  if (
    typeof authorizationEndpoint !== "string" ||
    typeof tokenEndpoint !== "string" ||
    typeof jwksUri !== "string"
  ) {
    throw new Error(`OIDC discovery document for ${issuer} is missing required endpoints`);
  }
  return { authorizationEndpoint, tokenEndpoint, jwksUri };
}

export interface Pkce {
  codeVerifier: string;
  codeChallenge: string;
}

export async function generatePkce(): Promise<Pkce> {
  const codeVerifier = base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  const codeChallenge = base64UrlEncode(new Uint8Array(digest));
  return { codeVerifier, codeChallenge };
}

export function generateNonce(): string {
  return base64UrlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

export function buildAuthorizationUrl(
  connection: Pick<OidcConnectionEndpoints, "authorizationEndpoint" | "clientId">,
  options: { redirectUri: string; state: string; nonce: string; codeChallenge: string },
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: connection.clientId,
    redirect_uri: options.redirectUri,
    scope: "openid email profile",
    state: options.state,
    nonce: options.nonce,
    code_challenge: options.codeChallenge,
    code_challenge_method: "S256",
  });
  return `${connection.authorizationEndpoint}?${params.toString()}`;
}

export async function exchangeCodeForIdToken(
  connection: Pick<OidcConnectionEndpoints, "tokenEndpoint" | "clientId" | "clientSecret">,
  options: { code: string; codeVerifier: string; redirectUri: string },
): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: options.code,
    redirect_uri: options.redirectUri,
    client_id: connection.clientId,
    client_secret: connection.clientSecret,
    code_verifier: options.codeVerifier,
  });

  const res = await fetch(connection.tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) throw new Error(`OIDC token exchange failed: HTTP ${res.status}`);

  const tokens = (await res.json()) as Record<string, unknown>;
  if (typeof tokens.id_token !== "string") throw new Error("OIDC token response did not include an id_token");
  return tokens.id_token;
}

export interface VerifiedIdTokenClaims {
  email: string;
  sub: string;
}

export async function verifyIdToken(
  connection: Pick<OidcConnectionEndpoints, "issuer" | "clientId" | "jwksUri">,
  idToken: string,
  options: { nonce: string },
): Promise<VerifiedIdTokenClaims> {
  const jwks = createRemoteJWKSet(new URL(connection.jwksUri));
  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: connection.issuer,
    audience: connection.clientId,
  });

  if (payload.nonce !== options.nonce) throw new Error("OIDC id_token nonce mismatch");
  if (typeof payload.email !== "string") throw new Error("OIDC id_token did not include an email claim");
  if (typeof payload.sub !== "string") throw new Error("OIDC id_token did not include a sub claim");

  return { email: payload.email, sub: payload.sub };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
