import { createDbClient, type Database } from "@hrm/db";

/**
 * A fresh client per request, deliberately NOT cached across requests.
 * Workers forbids using an I/O object (sockets, streams, request/response
 * bodies) from a request context other than the one that created it — a
 * module-level cached connection works fine under Node-based test runners
 * (vitest never enforces this) but throws "Cannot perform I/O on behalf of
 * a different request" under real `wrangler dev`/production the moment a
 * second request reuses a connection opened during a prior request.
 * Real connection pooling belongs in front of this, via a Hyperdrive
 * binding (docs/architecture/08-scalability.md) — Hyperdrive pools at the
 * infrastructure layer precisely so the Worker itself can create a "new"
 * connection per request cheaply. Until that binding exists, this pays a
 * fresh TCP+auth handshake per request against the docker-compose Postgres.
 */
export function getDb(connectionString: string): Database {
  return createDbClient(connectionString);
}
