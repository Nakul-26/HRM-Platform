import { z } from "zod";
import { PERMISSIONS } from "./permissions";

export const isolationTierSchema = z.enum(["pooled", "isolated"]);
export type IsolationTier = z.infer<typeof isolationTierSchema>;

export const tenantSchema = z.object({
  id: z.string().uuid(),
  slug: z
    .string()
    .min(2)
    .max(63)
    .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "must be a valid subdomain segment"),
  name: z.string().min(1).max(200),
  isolationTier: isolationTierSchema.default("pooled"),
  createdAt: z.coerce.date(),
});
export type Tenant = z.infer<typeof tenantSchema>;

export const createTenantSchema = tenantSchema.pick({ slug: true, name: true }).extend({
  adminEmail: z.string().email(),
  adminName: z.string().min(1).max(200),
  adminPassword: z.string().min(8).max(200),
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const permissionSchema = z.enum(PERMISSIONS);

export const roleSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string().min(1).max(100),
  isSystem: z.boolean(),
  permissions: z.array(permissionSchema),
});
export type Role = z.infer<typeof roleSchema>;

export const createRoleSchema = roleSchema.pick({ name: true, permissions: true });
export type CreateRoleInput = z.infer<typeof createRoleSchema>;
