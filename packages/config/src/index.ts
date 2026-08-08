import { z, type ZodTypeAny } from "zod";

/**
 * Every service extends this with its own required vars via `.extend(...)`.
 * Loading fails at process boot, not at first use in a request handler.
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  /** Admin/migration connection (DDL owner) — used only by drizzle-kit and migrate.ts. */
  DATABASE_URL: z.string().url(),
  /**
   * Runtime connection for services, authenticated as the `hrm_app` role
   * (see packages/db/src/rls/enable-rls.sql) — deliberately NOT the table
   * owner, so RLS policies actually apply to it. Never use DATABASE_URL for
   * request-serving code.
   */
  APP_DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SIGNING_KEY: z.string().min(32),
  JWT_KID: z.string().min(1).default("default"),
});

export type BaseEnv = z.infer<typeof baseEnvSchema>;

/**
 * Parses process.env (or a supplied record) against a Zod schema and exits
 * the process with a readable diagnostic on failure, rather than letting a
 * malformed/missing var surface as an obscure runtime error later.
 *
 * Generic is constrained to the schema itself (not a separately-inferred
 * `T`) so the return type is exactly `z.infer<Schema>` — binding through a
 * `ZodSchema<T>`-shaped parameter instead loses the distinction between a
 * field's input type (optional, pre-`.default()`) and output type
 * (required), and silently widens defaulted fields back to optional.
 */
export function loadEnv<Schema extends ZodTypeAny>(
  schema: Schema,
  env: Record<string, string | undefined> = process.env,
): z.infer<Schema> {
  const result = schema.safeParse(env);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    console.error(`Invalid environment configuration:\n${issues}`);
    process.exit(1);
  }
  return result.data;
}
