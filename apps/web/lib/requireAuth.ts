import { redirect } from "next/navigation";
import type { AuthContext } from "@hrm/types";
import { gatewayFetch } from "./gateway";

/** Confirms the session cookie still holds a valid, unexpired token — middleware only checks presence. */
export async function requireAuth(): Promise<AuthContext> {
  const result = await gatewayFetch<AuthContext>("/api/v1/whoami");
  if (!result.ok || !result.data) redirect("/login");
  return result.data;
}

export function hasPermission(auth: AuthContext, permission: string): boolean {
  return auth.permissions.includes(permission as AuthContext["permissions"][number]);
}
