"use server";

import { gatewayFetchCsv } from "@/lib/gateway";

export async function exportHeadcountAction() {
  return gatewayFetchCsv("/api/v1/reporting/headcount/export");
}

export async function exportAttendanceSummaryAction(query: string) {
  return gatewayFetchCsv(`/api/v1/reporting/attendance-summary/export${query}`);
}

export async function exportLeaveSummaryAction(query: string) {
  return gatewayFetchCsv(`/api/v1/reporting/leave-summary/export${query}`);
}

export async function exportPayrollSummaryAction() {
  return gatewayFetchCsv("/api/v1/reporting/payroll-summary/export");
}
