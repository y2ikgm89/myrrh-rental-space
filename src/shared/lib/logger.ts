/**
 * GCP 構造化汎用ロガー
 *
 * 本番環境: Cloud Logging 対応の JSON 構造化ログを出力（severity フィールド付き）
 * 開発環境: 人間可読フォーマットで出力
 *
 * サーバーサイドのエラーログには `@/shared/lib/errors/server` の
 * `logError` を使用（カテゴリ・深刻度付き構造化ログ + Error Reporting 連携）。
 *
 * @see https://cloud.google.com/logging/docs/structured-logging#special-payload-fields
 */

/**
 * GCP Cloud Logging LogSeverity
 * @see https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity
 */
type GcpLogSeverity = "DEBUG" | "INFO" | "WARNING" | "ERROR";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_TO_GCP_SEVERITY: Record<LogLevel, GcpLogSeverity> = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
};

/** GCP 構造化ログエントリ */
interface GcpLogEntry {
  severity: GcpLogSeverity;
  message: string;
  context?: Record<string, unknown> | undefined;
  timestamp: string;
}

function formatLog(
  level: LogLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  if (process.env["NODE_ENV"] !== "production") {
    const prefix = `[${level.toUpperCase()}]`;
    const consoleFn = level === "debug" ? "log" : level;
    if (context) {
      console[consoleFn](prefix, message, context);
    } else {
      console[consoleFn](prefix, message);
    }
  } else {
    // 本番: info 以上のみ GCP 構造化 JSON で出力
    if (level === "debug") return;

    const entry: GcpLogEntry = {
      severity: LEVEL_TO_GCP_SEVERITY[level],
      message,
      context,
      timestamp: new Date().toISOString(),
    };

    const consoleFn = level === "info" ? "log" : level;
    console[consoleFn](JSON.stringify(entry));
  }
}

/**
 * 統一ロガー
 *
 * @example
 * logger.error('Failed to save', { userId, error: e.message })
 * logger.warn('Deprecated API called')
 * logger.info('IconUser logged in', { userId })
 * logger.debug('Processing item', { itemId }) // 開発環境のみ
 */
export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => {
    formatLog("debug", message, context);
  },
  info: (message: string, context?: Record<string, unknown>) => {
    formatLog("info", message, context);
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    formatLog("warn", message, context);
  },
  error: (message: string, context?: Record<string, unknown>) => {
    formatLog("error", message, context);
  },
};
