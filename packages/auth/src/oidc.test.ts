import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import {
  buildAuthorizationUrl,
  discoverOidcEndpoints,
  exchangeCodeForIdToken,
  generateNonce,
  generatePkce,
  verifyIdToken,
} from "./oidc";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generatePkce", () => {
  it("produces a code_challenge that is SHA-256(code_verifier), base64url-encoded", async () => {
    const { codeVerifier, codeChallenge } = await generatePkce();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
    const expected = btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    expect(codeChallenge).toBe(expected);
  });
});

describe("generateNonce", () => {
  it("produces distinct, non-empty values", () => {
    expect(generateNonce()).not.toBe(generateNonce());
    expect(generateNonce().length).toBeGreaterThan(10);
  });
});

describe("buildAuthorizationUrl", () => {
  it("includes PKCE, state, and nonce params", () => {
    const url = buildAuthorizationUrl(
      { authorizationEndpoint: "https://idp.example.com/authorize", clientId: "client-123" },
      { redirectUri: "https://api.hrm.test/callback", state: "state-abc", nonce: "nonce-xyz", codeChallenge: "challenge-1" },
    );
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe("https://idp.example.com/authorize");
    expect(parsed.searchParams.get("client_id")).toBe("client-123");
    expect(parsed.searchParams.get("state")).toBe("state-abc");
    expect(parsed.searchParams.get("nonce")).toBe("nonce-xyz");
    expect(parsed.searchParams.get("code_challenge")).toBe("challenge-1");
    expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
    expect(parsed.searchParams.get("response_type")).toBe("code");
  });
});

describe("discoverOidcEndpoints", () => {
  it("parses a valid discovery document", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          authorization_endpoint: "https://idp.example.com/authorize",
          token_endpoint: "https://idp.example.com/token",
          jwks_uri: "https://idp.example.com/jwks",
        }),
        { status: 200 },
      ),
    );
    const endpoints = await discoverOidcEndpoints("https://idp.example.com");
    expect(endpoints).toEqual({
      authorizationEndpoint: "https://idp.example.com/authorize",
      tokenEndpoint: "https://idp.example.com/token",
      jwksUri: "https://idp.example.com/jwks",
    });
  });

  it("throws when the discovery document is missing required fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await expect(discoverOidcEndpoints("https://idp.example.com")).rejects.toThrow(/missing required endpoints/);
  });

  it("throws when the discovery request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 500 }));
    await expect(discoverOidcEndpoints("https://idp.example.com")).rejects.toThrow(/HTTP 500/);
  });
});

describe("exchangeCodeForIdToken", () => {
  const connection = {
    tokenEndpoint: "https://idp.example.com/token",
    clientId: "client-123",
    clientSecret: "shh",
  };

  it("returns the id_token from a successful exchange", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id_token: "id-token-value", access_token: "at" }), { status: 200 }),
    );
    const idToken = await exchangeCodeForIdToken(connection, {
      code: "auth-code",
      codeVerifier: "verifier",
      redirectUri: "https://api.hrm.test/callback",
    });
    expect(idToken).toBe("id-token-value");
  });

  it("throws when the response has no id_token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ access_token: "at" }), { status: 200 }));
    await expect(
      exchangeCodeForIdToken(connection, { code: "c", codeVerifier: "v", redirectUri: "https://x" }),
    ).rejects.toThrow(/id_token/);
  });

  it("throws when the token endpoint returns an error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 400 }));
    await expect(
      exchangeCodeForIdToken(connection, { code: "c", codeVerifier: "v", redirectUri: "https://x" }),
    ).rejects.toThrow(/HTTP 400/);
  });
});

describe("verifyIdToken", () => {
  // jose's Node build talks to `node:https` directly for `createRemoteJWKSet`,
  // not `globalThis.fetch` — mocking fetch (as the other describe blocks do)
  // doesn't intercept it. Serving the JWKS from a real local HTTP server
  // exercises the actual remote-JWKS-fetch code path instead of bypassing it.
  let server: Server;
  let jwksUri: string;
  let currentJwks: unknown;

  beforeAll(async () => {
    server = createServer((_req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(currentJwks));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as AddressInfo;
    jwksUri = `http://127.0.0.1:${address.port}/jwks`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function signTestIdToken(claims: Record<string, unknown>) {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwk = await exportJWK(publicKey);
    const idToken = await new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: "test-kid" })
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey);
    currentJwks = { keys: [{ ...jwk, kid: "test-kid", use: "sig", alg: "ES256" }] };
    return idToken;
  }

  it("verifies a well-formed id_token and returns email + sub", async () => {
    const idToken = await signTestIdToken({
      iss: "https://idp.example.com",
      aud: "client-123",
      nonce: "nonce-1",
      email: "user@example.com",
      sub: "idp-subject-1",
    });

    const claims = await verifyIdToken(
      { issuer: "https://idp.example.com", clientId: "client-123", jwksUri },
      idToken,
      { nonce: "nonce-1" },
    );
    expect(claims).toEqual({ email: "user@example.com", sub: "idp-subject-1" });
  });

  it("rejects a nonce mismatch", async () => {
    const idToken = await signTestIdToken({
      iss: "https://idp.example.com",
      aud: "client-123",
      nonce: "nonce-1",
      email: "user@example.com",
      sub: "idp-subject-1",
    });

    await expect(
      verifyIdToken({ issuer: "https://idp.example.com", clientId: "client-123", jwksUri }, idToken, {
        nonce: "wrong-nonce",
      }),
    ).rejects.toThrow(/nonce mismatch/);
  });

  it("rejects a token missing the email claim", async () => {
    const idToken = await signTestIdToken({
      iss: "https://idp.example.com",
      aud: "client-123",
      nonce: "nonce-1",
      sub: "idp-subject-1",
    });

    await expect(
      verifyIdToken({ issuer: "https://idp.example.com", clientId: "client-123", jwksUri }, idToken, {
        nonce: "nonce-1",
      }),
    ).rejects.toThrow(/email claim/);
  });

  it("rejects a token with the wrong issuer", async () => {
    const idToken = await signTestIdToken({
      iss: "https://attacker.example.com",
      aud: "client-123",
      nonce: "nonce-1",
      email: "user@example.com",
      sub: "idp-subject-1",
    });

    await expect(
      verifyIdToken({ issuer: "https://idp.example.com", clientId: "client-123", jwksUri }, idToken, {
        nonce: "nonce-1",
      }),
    ).rejects.toThrow();
  });
});
