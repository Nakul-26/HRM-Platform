/**
 * Server-generated key, never client-supplied — the tenant prefix is what
 * the download-url check relies on to refuse cross-tenant access, same
 * discipline as apps/document-service/src/lib/objectKey.ts.
 */
export function buildPayslipObjectKey(tenantId: string, payrollRunId: string, employeeId: string): string {
  return `payslips/tenants/${tenantId}/runs/${payrollRunId}/${employeeId}.pdf`;
}

export function objectKeyBelongsToTenant(objectKey: string, tenantId: string): boolean {
  return objectKey.startsWith(`payslips/tenants/${tenantId}/`);
}
