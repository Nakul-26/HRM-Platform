import { createDbClient, type Database } from "@hrm/db";

/**
 * A fresh client per request — see apps/employee-service/src/db.ts for the
 * full rationale (caching across requests violates Workers' cross-request
 * I/O restriction; duplicated deliberately rather than shared, same as the
 * requestId middleware).
 */
export function getDb(connectionString: string): Database {
  return createDbClient(connectionString);
}
