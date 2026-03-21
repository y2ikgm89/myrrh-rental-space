/**
 * エラーログ実装（Node / スクリプト両用）
 *
 * `logger.ts` は `server-only` 付きでこのファイルを re-export。
 * Prisma seed などは `@/shared/lib/errors/logger-core` を直接 import すること。
 */

import type { ErrorLogContext } from "./types";
import type { ErrorSeverity } from "./types";

type GcpLogSeverity = "CRITICAL" | "ERROR" | "WARNING" | "INFO";

const SEVERITY_TO_GCP: Record<ErrorSeverity, GcpLogSeverity> = {
  CRITICAL: "CRITICAL",
  HIGH: "ERROR",
  MEDIUM: "WARNING",
  LOW: "INFO",
};

const ERROR_REPORTING_TYPE =
  "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent";

interface GcpStructuredLog {
  severity: GcpLogSeverity;
  message: string;
  stack_trace?: string | undefined;
  serviceContext: { service: string; version: string };
  "@type"?: string | undefined;
  category: string;
  context?: Record<string, unknown> | undefined;
  userId?: string | undefined;
  timestamp: string;
}

function extractMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    const json = JSON.stringify(error);
    return json === "{}"
      ? `[non-Error object: ${Object.getPrototypeOf(error)?.constructor?.name ?? typeof error}]`
      : json;
  } catch {
    return String(error);
  }
}

const SERVICE_NAME = process.env["K_SERVICE"] ?? "myrrh-rental-space";
const SERVICE_VERSION = process.env["K_REVISION"] ?? "local";

export function logError(error: unknown, logContext: ErrorLogContext): void {
  const gcpSeverity = SEVERITY_TO_GCP[logContext.severity];
  const message = extractMessage(error);
  const stack =
    error instanceof Error ? error.stack : `Error: ${message}\n    at unknown`;

  if (process.env["NODE_ENV"] === "production") {
    const entry: GcpStructuredLog = {
      severity: gcpSeverity,
      message,
      serviceContext: { service: SERVICE_NAME, version: SERVICE_VERSION },
      category: logContext.category,
      context: logContext.context,
      userId: logContext.userId,
      timestamp: (logContext.timestamp ?? new Date()).toISOString(),
    };

    if (gcpSeverity === "CRITICAL" || gcpSeverity === "ERROR") {
      entry.stack_trace = stack;
      entry["@type"] = ERROR_REPORTING_TYPE;
    }

    console.error(JSON.stringify(entry));
  } else {
    console.error("[Error]", {
      severity: gcpSeverity,
      message,
      stack,
      category: logContext.category,
      context: logContext.context,
      userId: logContext.userId,
    });
  }
}

export function createErrorLogger(
  defaultContext: Pick<ErrorLogContext, "category" | "severity"> &
    Partial<ErrorLogContext>,
) {
  return (error: unknown, context?: Partial<ErrorLogContext>) => {
    logError(error, { ...defaultContext, ...context });
  };
}
