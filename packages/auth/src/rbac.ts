import { hasPermission, type AuthContext, type Permission } from "@hrm/types";

export interface OwnershipContext {
  /** True if the resource belongs to the caller themselves. */
  isSelf: boolean;
  /**
   * True if the resource belongs to one of the caller's direct reports.
   * Resolved by the calling service (it requires an org-chart lookup) —
   * this helper only combines the result with the permission check so the
   * combination logic can't drift between services.
   */
  isDirectReport: boolean;
}

/**
 * The two-dimension check from docs/architecture/06-security.md: permission
 * set (role) AND ownership scope (self/direct-reports vs the `_all` variant).
 * Tenant scope is enforced separately, upstream, by RLS + middleware — this
 * assumes `ctx` and the resource already resolved to the same tenant.
 */
export function can(ctx: AuthContext, basePermission: Permission, ownership: OwnershipContext): boolean {
  const allVariant = `${basePermission}_all` as Permission;
  if (hasPermission(ctx, allVariant)) return true;
  if (!hasPermission(ctx, basePermission)) return false;
  return ownership.isSelf || ownership.isDirectReport;
}

/** For permissions with no scoped `_all` variant (e.g. `leave.apply`) — a plain grant check. */
export function canUnscoped(ctx: AuthContext, permission: Permission): boolean {
  return hasPermission(ctx, permission);
}
