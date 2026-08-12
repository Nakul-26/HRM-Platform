function sanitizeFileName(fileName: string): string {
  const base = fileName.split(/[/\\]/).pop() ?? "file";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150);
}

/**
 * Server-generated key, never client-supplied — the tenant/candidate prefix
 * is what the download-url check relies on to refuse cross-tenant access,
 * so nothing in the request body can influence it (same convention as
 * apps/document-service's objectKey.ts).
 */
export function buildResumeObjectKey(tenantId: string, candidateId: string, fileName: string): string {
  return `resumes/tenants/${tenantId}/candidates/${candidateId}/${crypto.randomUUID()}-${sanitizeFileName(fileName)}`;
}

export function objectKeyBelongsToTenant(objectKey: string, tenantId: string): boolean {
  return objectKey.startsWith(`resumes/tenants/${tenantId}/`);
}
