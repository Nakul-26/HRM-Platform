"use server";

import { gatewayFetchCsv } from "@/lib/gateway";

export async function exportAuditLogAction(query: string) {
  return gatewayFetchCsv(`/api/v1/reporting/audit-log/export${query}`);
}
