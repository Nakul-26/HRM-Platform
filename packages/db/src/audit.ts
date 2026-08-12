import type { Database } from "./client";
import { auditLogs } from "./schema/index";

export interface AuditLogEntry {
  tenantId: string;
  actorId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
}

/**
 * Appends one row to `audit_logs`. Call this inside the same `withTenant`
 * transaction as the mutation it records, so the audit row and the mutation
 * commit or roll back together. `audit_logs` is append-only at the DB level
 * (UPDATE/DELETE revoked from the service role — see enable-rls.sql), so
 * this is the only supported way to write to it.
 */
export async function recordAuditLog(tx: Database, entry: AuditLogEntry): Promise<void> {
  await tx.insert(auditLogs).values({
    tenantId: entry.tenantId,
    actorId: entry.actorId,
    action: entry.action,
    resourceType: entry.resourceType,
    resourceId: entry.resourceId ?? null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    ipAddress: entry.ipAddress ?? null,
  });
}
