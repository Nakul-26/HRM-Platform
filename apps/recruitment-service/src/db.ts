import { createDbClient, type Database } from "@hrm/db";

/**
 * A fresh client per request, deliberately NOT cached across requests.
 * Workers forbids using an I/O object (sockets, streams, request/response
 * bodies) from a request context other than the one that created it — a
 * module-level cached connection works fine under Node-based test runners
 * (vitest never enforces this) but throws "Cannot perform I/O on behalf of
 * a different request" under real `wrangler dev`/production the moment a
 * second request reuses a connection opened during a prior request (see
 * apps/employee-service/src/db.ts for where this was first discovered).
 * Real connection pooling belongs in front of this, via a Hyperdrive
 * binding (docs/architecture/08-scalability.md) — not yet provisioned.
 */
export function getDb(connectionString: string): Database {
  return createDbClient(connectionString);
}
