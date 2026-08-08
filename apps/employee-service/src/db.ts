import { createDbClient, type Database } from "@hrm/db";

/**
 * One connection pool per Worker isolate, lazily created on first request
 * and reused across the isolate's lifetime — matches the pattern used for
 * every other external connection in a Workers runtime (the isolate's `env`
 * is stable for its lifetime; a fresh client per request would defeat
 * connection pooling entirely). Production traffic goes through a
 * Hyperdrive binding in front of this same connection string once
 * provisioned (docs/architecture/08-scalability.md); local dev and tests
 * connect straight to the docker-compose Postgres.
 */
let cached: Database | undefined;

export function getDb(connectionString: string): Database {
  if (!cached) {
    cached = createDbClient(connectionString);
  }
  return cached;
}
