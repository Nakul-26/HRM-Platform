import { z } from "zod";
import { permissionSchema } from "./platform";

/**
 * The identity claims resolved once at the Gateway (see
 * docs/architecture/06-security.md) and forwarded signed to downstream
 * services, which trust it without re-querying Identity per request.
 */
export const authContextSchema = z.object({
  tenantId: z.string().uuid(),
  userId: z.string().uuid(),
  employeeId: z.string().uuid().nullable(),
  roleId: z.string().uuid(),
  roleName: z.string(),
  permissions: z.array(permissionSchema),
});
export type AuthContext = z.infer<typeof authContextSchema>;

export function hasPermission(ctx: AuthContext, permission: z.infer<typeof permissionSchema>): boolean {
  return ctx.permissions.includes(permission);
}
