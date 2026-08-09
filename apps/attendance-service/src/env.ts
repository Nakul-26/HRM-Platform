import type { AuthMiddlewareEnv } from "@hrm/auth";

export interface Env extends AuthMiddlewareEnv {
  APP_DATABASE_URL: string;
}
