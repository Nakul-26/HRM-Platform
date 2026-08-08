import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index";

export type Database = PostgresJsDatabase<typeof schema>;

export function createDbClient(connectionString: string): Database {
  const client = postgres(connectionString);
  return drizzle(client, { schema });
}

/**
 * Every tenant-scoped query MUST go through this. It sets
 * `app.current_tenant_id` local to a transaction (the `true` third arg to
 * `set_config`) so Postgres RLS policies (see migration 0002) scope every
 * statement inside `fn` to `tenantId` — this is the enforcement layer that
 * backs docs/architecture/03-multi-tenancy.md, independent of and in
 * addition to the application-level tenant check in middleware.
 */
export async function withTenant<T>(db: Database, tenantId: string, fn: (tx: Database) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_tenant_id', ${tenantId}, true)`);
    return fn(tx as unknown as Database);
  });
}
