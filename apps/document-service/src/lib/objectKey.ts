function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
}

/**
 * Server-generated key, never client-supplied — the tenant/employee prefix
 * is what apps/document-service's download-url check relies on to refuse
 * cross-tenant access, so nothing in the request body can influence it.
 */
export function buildObjectKey(tenantId: string, employeeId: string, fileName: string): string {
  return `tenants/${tenantId}/employees/${employeeId}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}

export function objectKeyBelongsToTenant(objectKey: string, tenantId: string): boolean {
  return objectKey.startsWith(`tenants/${tenantId}/`);
}
