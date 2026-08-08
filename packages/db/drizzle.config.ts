import { defineConfig } from "drizzle-kit";
import { loadEnv, baseEnvSchema } from "@hrm/config";

const env = loadEnv(baseEnvSchema);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: env.DATABASE_URL,
  },
  strict: true,
  verbose: true,
});
