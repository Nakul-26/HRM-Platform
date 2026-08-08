import pino, { type Logger } from "pino";

export interface LogContext {
  requestId?: string;
  tenantId?: string;
  service: string;
}

/**
 * Structured JSON everywhere (docs/architecture/07-infrastructure-devops.md)
 * so any log line ships to Logpush/Axiom/Datadog without reformatting.
 * `requestId`/`tenantId` are bound once per request via `.child(...)` at the
 * top of the request pipeline so every downstream log call carries them
 * without threading them through every function signature.
 */
export function createLogger(context: LogContext): Logger {
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    base: { service: context.service },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  }).child({ requestId: context.requestId, tenantId: context.tenantId });
}

export type { Logger };
