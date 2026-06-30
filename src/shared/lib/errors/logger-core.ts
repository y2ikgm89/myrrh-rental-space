/**
 * 構造化ログ実装（Node / スクリプト両用・Cloud Logging 準拠）
 *
 * - エラーログ: `logError` / `createErrorLogger`
 * - 汎用ログ : `logger.{debug,info,warn,error}`
 *
 * 本ファイルは `server-only` を付けない（Prisma seed など Node スクリプトからも import するため）。
 * Next.js Server 専用エントリは `@/shared/lib/errors/logger` (server-only re-export)。
 *
 * # Cloud Logging 特殊フィールド対応
 * `logging.googleapis.com/trace`・`spanId`・`trace_sampled`・`httpRequest` を出力に含めると
 * Cloud Logging が 1 request 単位でログを横断検索できる（Trace と紐付く）。
 * 値の取得は呼び出し側責務（`onRequestError` / proxy で抽出）。
 *
 * @see https://cloud.google.com/logging/docs/structured-logging#special-payload-fields
 * @see https://cloud.google.com/logging/docs/agent/logging/configuration#special-fields
 * @see https://cloud.google.com/trace/docs/setup#force-trace
 */

import type { ErrorLogContext } from "./types";
import type { ErrorSeverity } from "./types";

// ---------------------------------------------------------------------------
// GCP severity マッピング
// ---------------------------------------------------------------------------

type GcpLogSeverity = "DEBUG" | "INFO" | "WARNING" | "ERROR" | "CRITICAL";

const SEVERITY_TO_GCP: Record<ErrorSeverity, GcpLogSeverity> = {
  CRITICAL: "CRITICAL",
  HIGH: "ERROR",
  MEDIUM: "WARNING",
  LOW: "INFO",
};

const ERROR_REPORTING_TYPE =
  "type.googleapis.com/google.devtools.clouderrorreporting.v1beta1.ReportedErrorEvent";

const SERVICE_NAME = process.env["K_SERVICE"] ?? "myrrh-rental-space";
const SERVICE_VERSION = process.env["K_REVISION"] ?? "local";

/**
 * GCP project ID（trace リソース名の構築に必要）。
 *
 * Cloud Run / Cloud Functions では `GOOGLE_CLOUD_PROJECT` が自動的に注入される。
 * 未設定（ローカル開発 / テスト）の場合、trace フィールド出力は skip される
 * （Cloud Logging エージェントが受け取っても link を貼れないため）。
 */
const GCP_PROJECT_ID =
  process.env["GOOGLE_CLOUD_PROJECT"] ??
  process.env["GCP_PROJECT"] ??
  process.env["GCLOUD_PROJECT"] ??
  null;

// ---------------------------------------------------------------------------
// Cloud Trace context: parse / build
// ---------------------------------------------------------------------------

/**
 * Cloud Trace Context header の format:
 *   `TRACE_ID/SPAN_ID;o=TRACE_TRUE`
 *
 * - TRACE_ID: 32-char lowercase hex（Google 公式仕様）
 * - SPAN_ID : 10進数の符号無し 64bit 整数 string
 * - TRACE_TRUE: `1` の場合 sampled
 *
 * @see https://cloud.google.com/trace/docs/setup#force-trace
 */
const TRACE_ID_PATTERN = /^[0-9a-f]{32}$/i;
const SPAN_ID_PATTERN = /^\d{1,20}$/;

export interface ParsedCloudTraceContext {
  traceId: string;
  spanId?: string | undefined;
  traceSampled?: boolean | undefined;
}

export function parseCloudTraceContext(
  headerValue: string | null | undefined,
): ParsedCloudTraceContext | null {
  if (!headerValue) return null;
  // `TRACE_ID[/SPAN_ID][;o=TRACE_TRUE]`
  const semiIdx = headerValue.indexOf(";");
  const main = semiIdx >= 0 ? headerValue.slice(0, semiIdx) : headerValue;
  const options = semiIdx >= 0 ? headerValue.slice(semiIdx + 1) : "";

  const [traceId, spanId] = main.split("/", 2);
  if (!traceId || !TRACE_ID_PATTERN.test(traceId)) return null;

  const sampledMatch = /(?:^|;)\s*o=(\d+)/.exec(options);
  const traceSampled = sampledMatch ? sampledMatch[1] === "1" : undefined;

  return {
    traceId,
    spanId: spanId && SPAN_ID_PATTERN.test(spanId) ? spanId : undefined,
    traceSampled,
  };
}

/**
 * Cloud Logging が require する trace リソース名: `projects/{PROJECT_ID}/traces/{TRACE_ID}`
 */
function buildTraceResource(traceId: string): string | null {
  if (!GCP_PROJECT_ID) return null;
  return `projects/${GCP_PROJECT_ID}/traces/${traceId}`;
}

// ---------------------------------------------------------------------------
// httpRequest 特殊フィールド
// ---------------------------------------------------------------------------

/**
 * Cloud Logging `httpRequest` 特殊 payload field。
 *
 * 必要最低限の subset のみ提供。`latency` は `Ns.NNNNNNNNNs` 形式の string（duration proto）。
 *
 * @see https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#httprequest
 */
export interface HttpRequestPayload {
  requestMethod?: string | undefined;
  requestUrl?: string | undefined;
  status?: number | undefined;
  userAgent?: string | undefined;
  responseSize?: string | undefined;
  latency?: string | undefined;
  remoteIp?: string | undefined;
  referer?: string | undefined;
  protocol?: string | undefined;
}

// ---------------------------------------------------------------------------
// Structured log entry
// ---------------------------------------------------------------------------

interface CloudLoggingFields {
  "logging.googleapis.com/trace"?: string;
  "logging.googleapis.com/spanId"?: string;
  "logging.googleapis.com/trace_sampled"?: boolean;
  httpRequest?: HttpRequestPayload;
}

interface GcpStructuredErrorLog extends CloudLoggingFields {
  severity: GcpLogSeverity;
  message: string;
  stack_trace?: string;
  serviceContext: { service: string; version: string };
  "@type"?: string;
  category: string;
  context?: Record<string, unknown>;
  userId?: string;
  timestamp: string;
}

interface GcpStructuredGenericLog extends CloudLoggingFields {
  severity: GcpLogSeverity;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

function applyCloudLoggingFields(
  target: CloudLoggingFields,
  enrichment: LogEnrichment | undefined,
): void {
  if (!enrichment) return;
  if (enrichment.traceId) {
    const traceResource = buildTraceResource(enrichment.traceId);
    if (traceResource) {
      target["logging.googleapis.com/trace"] = traceResource;
    }
    if (enrichment.spanId) {
      target["logging.googleapis.com/spanId"] = enrichment.spanId;
    }
    if (typeof enrichment.traceSampled === "boolean") {
      target["logging.googleapis.com/trace_sampled"] = enrichment.traceSampled;
    }
  }
  if (enrichment.httpRequest) {
    target.httpRequest = enrichment.httpRequest;
  }
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Cloud Logging 特殊 payload field を構造化ログに乗せるための optional enrichment。
 *
 * 通常は呼び出し側（proxy / onRequestError）が trace context header を parse して渡す。
 */
export interface LogEnrichment {
  traceId?: string | undefined;
  spanId?: string | undefined;
  traceSampled?: boolean | undefined;
  httpRequest?: HttpRequestPayload | undefined;
}

export type ExtendedErrorLogContext = ErrorLogContext & LogEnrichment;

// ---------------------------------------------------------------------------
// extractMessage
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// logError
// ---------------------------------------------------------------------------

export function logError(
  error: unknown,
  logContext: ExtendedErrorLogContext,
): void {
  const gcpSeverity = SEVERITY_TO_GCP[logContext.severity];
  const message = extractMessage(error);
  const stack =
    error instanceof Error
      ? (error.stack ?? `${error.name}: ${error.message}\n    at unknown`)
      : `Error: ${message}\n    at unknown`;

  if (process.env["NODE_ENV"] === "production") {
    const entry: GcpStructuredErrorLog = {
      severity: gcpSeverity,
      message,
      serviceContext: { service: SERVICE_NAME, version: SERVICE_VERSION },
      category: logContext.category,
      timestamp: (logContext.timestamp ?? new Date()).toISOString(),
    };
    if (logContext.context !== undefined) entry.context = logContext.context;
    if (logContext.userId !== undefined) entry.userId = logContext.userId;

    if (gcpSeverity === "CRITICAL" || gcpSeverity === "ERROR") {
      entry.stack_trace = stack;
      entry["@type"] = ERROR_REPORTING_TYPE;
    }

    applyCloudLoggingFields(entry, logContext);

    console.error(JSON.stringify(entry));
  } else {
    console.error("[Error]", {
      severity: gcpSeverity,
      message,
      stack,
      category: logContext.category,
      context: logContext.context,
      userId: logContext.userId,
      ...(logContext.traceId ? { traceId: logContext.traceId } : {}),
      ...(logContext.spanId ? { spanId: logContext.spanId } : {}),
      ...(logContext.httpRequest
        ? { httpRequest: logContext.httpRequest }
        : {}),
    });
  }
}

export function createErrorLogger(
  defaultContext: Pick<ErrorLogContext, "category" | "severity"> &
    Partial<ExtendedErrorLogContext>,
) {
  return (error: unknown, context?: Partial<ExtendedErrorLogContext>) => {
    logError(error, { ...defaultContext, ...context });
  };
}

// ---------------------------------------------------------------------------
// Generic logger
// ---------------------------------------------------------------------------

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_TO_GCP_SEVERITY: Record<LogLevel, GcpLogSeverity> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
};

function emitGeneric(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
  enrichment?: LogEnrichment,
): void {
  if (process.env["NODE_ENV"] !== "production") {
    const prefix = `[${level.toUpperCase()}]`;
    const consoleFn = level === "debug" ? "log" : level;
    if (context) {
      console[consoleFn](prefix, message, context);
    } else {
      console[consoleFn](prefix, message);
    }
    return;
  }

  // 本番: debug は drop（旧実装の挙動を維持）
  if (level === "debug") return;

  const entry: GcpStructuredGenericLog = {
    severity: LEVEL_TO_GCP_SEVERITY[level],
    message,
    timestamp: new Date().toISOString(),
  };
  if (context !== undefined) entry.context = context;
  applyCloudLoggingFields(entry, enrichment);

  const consoleFn = level === "info" ? "log" : level;
  console[consoleFn](JSON.stringify(entry));
}

/**
 * 統一汎用ロガー（SSoT）。
 *
 * @example
 *   logger.error('Failed to save', { userId, error: e.message })
 *   logger.warn('Deprecated API called')
 *   logger.info('User logged in', { userId })
 *   logger.debug('Processing item', { itemId }) // 開発環境のみ
 *
 *   // trace context を明示的に乗せる場合（通常は instrumentation / proxy が担当）:
 *   logger.error('failed', { foo: 1 }, { traceId, spanId, httpRequest })
 */
export const logger = {
  debug: (
    message: string,
    context?: Record<string, unknown>,
    enrichment?: LogEnrichment,
  ) => emitGeneric("debug", message, context, enrichment),
  info: (
    message: string,
    context?: Record<string, unknown>,
    enrichment?: LogEnrichment,
  ) => emitGeneric("info", message, context, enrichment),
  warn: (
    message: string,
    context?: Record<string, unknown>,
    enrichment?: LogEnrichment,
  ) => emitGeneric("warn", message, context, enrichment),
  error: (
    message: string,
    context?: Record<string, unknown>,
    enrichment?: LogEnrichment,
  ) => emitGeneric("error", message, context, enrichment),
};
