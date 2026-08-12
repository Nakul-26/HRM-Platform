import { createDbClient, type Database } from "@hrm/db";

/**
 * A fresh client per request — see apps/payroll-service/src/db.ts for why
 * this can't be cached at module scope under real Workers. Reads the same
 * primary connection as every other service for now; a read-replica
 * connection string (docs/architecture/08-scalability.md) can be swapped in
 * here later without touching any route.
 */
export function getDb(connectionString: string): Database {
  return createDbClient(connectionString);
}
