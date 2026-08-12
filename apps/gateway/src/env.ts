import type { AuthMiddlewareEnv } from "@hrm/auth";

export interface Env extends AuthMiddlewareEnv {
  ROOT_DOMAIN: string;
  APP_DATABASE_URL: string;
  /** Base URL of the employee-service Worker; plain HTTP fetch, not a service binding, so this proxy works identically in wrangler dev, tests, and prod. */
  EMPLOYEE_SERVICE_URL: string;
  DOCUMENT_SERVICE_URL: string;
  LEAVE_SERVICE_URL: string;
  ATTENDANCE_SERVICE_URL: string;
  PAYROLL_SERVICE_URL: string;
  RECRUITMENT_SERVICE_URL: string;
  PERFORMANCE_SERVICE_URL: string;
  REPORTING_SERVICE_URL: string;
}
