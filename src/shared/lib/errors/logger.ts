/**
 * GCP 構造化エラーロガー
 *
 * 本番環境: Cloud Logging / Cloud Error Reporting 対応の JSON 構造化ログを出力
 * 開発環境: 人間可読フォーマットで出力
 *
 * @see https://cloud.google.com/logging/docs/structured-logging#special-payload-fields
 * @see https://cloud.google.com/error-reporting/docs/formatting-error-messages
 */

import "server-only";

import type { ErrorLogContext } from "./types";
import type { ErrorSeverity } from "./types";

/**
 * GCP Cloud Logging LogSeverity
 * @see https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity
 */
type GcpLogSeverity = "CRITICAL" | "ERROR" | "WARNING" | "INFO";

const SEVERITY_TO_GCP: Record<ErrorSeverity, GcpLogSeverity> = {
  CRITICAL: "CRITICAL",
  HIGH: "ERROR",
  MEDIUM: "WARNING",
  LOW: "INFO",
};

/**
 * Cloud Error Reporting が自動認識する @type フィールド
 * @see https://cloud.google.com/error-reporting/docs/formatting-error-messages#log-text
 */
const ERROR_REPORTING_TYPE =
  "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent";

/** GCP 構造化ログエントリ */
interface GcpStructuredLog {
  severity: GcpLogSeverity;
  message: string;
  /** Cloud Error Reporting がエラーをグループ化するためのスタックトレース */
  stack_trace?: string | undefined;
  /** Cloud Error Reporting のサービス識別 */
  serviceContext: { service: string; version: string };
  /** Error Reporting 自動認識トリガー（ERROR 以上で付与） */
  "@type"?: string | undefined;
  category: string;
  context?: Record<string, unknown> | undefined;
  userId?: string | undefined;
  timestamp: string;
}

/** Extract a useful message from any thrown value */
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

/**
 * エラーをログ出力
 *
 * 本番環境: GCP Cloud Logging 構造化 JSON
 * 開発環境: 人間可読フォーマット
 */
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

    // ERROR 以上: stack_trace + @type で Cloud Error Reporting が自動グループ化
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

/**
 * スコープ付きエラーロガーを作成
 *
 * @example
 * const logDbError = createErrorLogger({
 *   category: ErrorCategory.DATABASE,
 *   severity: ErrorSeverity.MEDIUM,
 * })
 * logDbError(error, { context: { table: 'users' } })
 */
export function createErrorLogger(
  defaultContext: Pick<ErrorLogContext, "category" | "severity"> &
    Partial<ErrorLogContext>,
) {
  return (error: unknown, context?: Partial<ErrorLogContext>) => {
    logError(error, { ...defaultContext, ...context });
  };
}
