/**
 * Canonical permission strings. This is the single source of truth consumed
 * by seed data (default roles), the @hrm/auth ownership-scope helper, and
 * the admin UI's role editor — adding a permission means adding it here once.
 *
 * Convention: `<domain>.<action>` for self/direct-report scoped actions,
 * `<domain>.<action>_all` for the org-wide variant of the same action.
 */
export const PERMISSIONS = [
  "employee.read",
  "employee.read_all",
  "employee.write",
  "employee.write_all",
  "employee.terminate",
  "department.manage",
  "attendance.read",
  "attendance.read_all",
  "attendance.correct",
  "attendance.correct_all",
  "attendance.clock",
  "attendance.request_correction",
  "attendance.shift.manage",
  "leave.apply",
  "leave.approve",
  "leave.approve_all",
  "leave.policy.manage",
  "payroll.run",
  "payroll.view",
  "payroll.view_all",
  "recruitment.manage",
  "performance.review",
  "performance.review_all",
  "tenant.settings.manage",
  "role.manage",
  "audit_log.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const DEFAULT_ROLES = ["admin", "hr_manager", "manager", "employee"] as const;
export type DefaultRole = (typeof DEFAULT_ROLES)[number];

/** Seed mapping for the four system default roles; tenants may define custom roles beyond this. */
export const DEFAULT_ROLE_PERMISSIONS: Record<DefaultRole, readonly Permission[]> = {
  admin: PERMISSIONS,
  hr_manager: [
    "employee.read_all",
    "employee.write_all",
    "employee.terminate",
    "department.manage",
    "attendance.read_all",
    "attendance.correct_all",
    "attendance.shift.manage",
    "leave.approve_all",
    "leave.policy.manage",
    "payroll.run",
    "payroll.view_all",
    "recruitment.manage",
    "performance.review_all",
    "audit_log.read",
  ],
  manager: [
    "employee.read",
    "attendance.read",
    "attendance.correct",
    "attendance.clock",
    "attendance.request_correction",
    "leave.apply",
    "leave.approve",
    "performance.review",
  ],
  // `employee.write` (not `_all`) is included here so every employee can
  // edit their own contact details via self-service — `can()` (see
  // packages/auth/src/rbac.ts) restricts non-`_all` grants to isSelf/
  // isDirectReport, so this never lets a plain employee write anyone else's record.
  employee: [
    "employee.read",
    "employee.write",
    "attendance.read",
    "attendance.clock",
    "attendance.request_correction",
    "leave.apply",
  ],
};
