import { migrate } from "drizzle-orm/postgres-js/migrator";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadEnv, baseEnvSchema } from "@hrm/config";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const env = loadEnv(baseEnvSchema);
  const client = postgres(env.DATABASE_URL, { max: 1 });
  const db = drizzle(client);

  console.log("Running Drizzle-generated migrations...");
  await migrate(db, { migrationsFolder: join(__dirname, "../migrations") });

  console.log("Applying RLS policies + grants (not expressible in Drizzle's typed schema)...");
  const rlsSql = readFileSync(join(__dirname, "rls/enable-rls.sql"), "utf-8");
  await client.unsafe(rlsSql);

  console.log("Migration complete.");
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
