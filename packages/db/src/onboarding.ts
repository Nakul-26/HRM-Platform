import { DEFAULT_ROLE_PERMISSIONS, DEFAULT_ROLES, type CreateTenantInput } from "@hrm/types";
import type { Database } from "./client";
import { roles, rolePermissions, tenants } from "./schema/index";

/**
 * Creates a tenant plus its four system default roles, pre-wired with the
 * standard permission set (docs/architecture/06-security.md). Runs outside
 * `withTenant` deliberately — there is no tenant context yet for this row's
 * own RLS check, so it must use the admin connection, not APP_DATABASE_URL.
 */
export async function createTenant(db: Database, input: CreateTenantInput) {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: input.name, subdomain: input.slug })
    .returning();

  if (!tenant) {
    throw new Error("Failed to create tenant");
  }

  for (const roleName of DEFAULT_ROLES) {
    const [role] = await db
      .insert(roles)
      .values({ tenantId: tenant.id, name: roleName, isSystemRole: true })
      .returning();

    if (!role) continue;

    const permissionRows = DEFAULT_ROLE_PERMISSIONS[roleName].map((permissionKey) => ({
      roleId: role.id,
      permissionKey,
    }));
    if (permissionRows.length > 0) {
      await db.insert(rolePermissions).values(permissionRows);
    }
  }

  return tenant;
}
