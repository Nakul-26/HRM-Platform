import { Hono } from "hono";
import type { Env } from "../env";

/**
 * Forwards a request to a downstream Workers service unchanged (same path,
 * query, method, headers, and body — including the already-verified bearer
 * token, which downstream services re-verify themselves rather than
 * trusting the Gateway's say-so alone). Plain HTTP fetch rather than a
 * Cloudflare service binding: works identically in wrangler dev, tests
 * (mocked), and prod without a Workers-specific multi-service dev setup.
 * The frontend never calls employee-service/document-service directly
 * (docs/architecture/01-services-and-communication.md) — this is the only
 * path to them.
 */
export function proxyRouter(getBaseUrl: (env: Env) => string) {
  const app = new Hono<{ Bindings: Env }>();

  app.all("*", async (c) => {
    const target = new URL(c.req.raw.url);
    const upstream = new URL(getBaseUrl(c.env));
    target.protocol = upstream.protocol;
    target.host = upstream.host;

    const upstreamRes = await fetch(new Request(target.toString(), c.req.raw));

    // `fetch()` transparently decompresses the body, but leaves the
    // upstream's `content-encoding`/`content-length` headers on the
    // Response object untouched — forwarding those as-is labels the
    // already-decoded body as still-compressed, so the eventual client
    // tries to gunzip plain bytes and gets garbage. Never caught by tests:
    // the mocked `fetch` there never sets these headers.
    const headers = new Headers(upstreamRes.headers);
    headers.delete("content-encoding");
    headers.delete("content-length");

    return new Response(upstreamRes.body, { status: upstreamRes.status, headers });
  });

  return app;
}
