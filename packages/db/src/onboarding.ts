import { hashPassword } from "better-auth/crypto";
import { DEFAULT_ROLE_PERMISSIONS, DEFAULT_ROLES, type CreateTenantInput } from "@hrm/types";
import type { Database } from "./client";
import { withTenant } from "./client";
import { accounts, employees, roles, rolePermissions, tenants, users } from "./schema/index";

/**
 * Creates a tenant plus its four system default roles (pre-wired with the
 * standard permission set, docs/architecture/06-security.md), an admin user
 * + credential account (password hashed with Better Auth's own hasher so
 * the gateway's login route — which verifies with the matching
 * `verifyPassword` — accepts it), and an employee record for that admin.
 *
 * The tenant row itself is inserted directly (the `tenants` table carries no
 * RLS policy — see packages/db/src/rls/enable-rls.sql — there is no tenant
 * context to set yet for it). Every child row is created inside
 * `withTenant`, scoped to the newly-created tenant's id, so this works
 * correctly whether `db` is the admin connection (seed script, bypasses RLS
 * anyway) or the RLS-enforced `hrm_app` connection (gateway signup route).
 */
export async function createTenant(db: Database, input: CreateTenantInput) {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: input.name, subdomain: input.slug })
    .returning();

  if (!tenant) {
    throw new Error("Failed to create tenant");
  }

  await withTenant(db, tenant.id, async (tx) => {
    let adminRoleId: string | undefined;

    for (const roleName of DEFAULT_ROLES) {
      const [role] = await tx
        .insert(roles)
        .values({ tenantId: tenant.id, name: roleName, isSystemRole: true })
        .returning();

      if (!role) continue;
      if (roleName === "admin") adminRoleId = role.id;

      const permissionRows = DEFAULT_ROLE_PERMISSIONS[roleName].map((permissionKey) => ({
        roleId: role.id,
        permissionKey,
      }));
      if (permissionRows.length > 0) {
        await tx.insert(rolePermissions).values(permissionRows);
      }
    }

    if (!adminRoleId) {
      throw new Error("Failed to create admin role");
    }

    const [adminUser] = await tx
      .insert(users)
      .values({ tenantId: tenant.id, roleId: adminRoleId, email: input.adminEmail, name: input.adminName })
      .returning();

    if (!adminUser) {
      throw new Error("Failed to create admin user");
    }

    const passwordHash = await hashPassword(input.adminPassword);
    await tx.insert(accounts).values({
      tenantId: tenant.id,
      userId: adminUser.id,
      providerId: "credential",
      accountId: input.adminEmail,
      passwordHash,
    });

    const [firstName, ...rest] = input.adminName.trim().split(/\s+/);
    await tx.insert(employees).values({
      tenantId: tenant.id,
      userId: adminUser.id,
      employeeCode: "EMP-0001",
      firstName: firstName ?? input.adminName,
      lastName: rest.length > 0 ? rest.join(" ") : "-",
      workEmail: input.adminEmail,
      employmentType: "full_time",
      dateOfJoining: new Date().toISOString().slice(0, 10),
      status: "active",
    });
  });

  return tenant;
}
