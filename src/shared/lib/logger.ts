/**
 * 統一ロガー
 *
 * 本番環境では構造化JSON、開発環境では読みやすい形式で出力。
 * クライアントコンポーネントやシンプルなログ用途に使用。
 *
 * サーバーサイドのエラーログには `@/shared/lib/errors` の
 * `logError` を使用（カテゴリ・深刻度付き構造化ログ）。
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

const isDev = process.env["NODE_ENV"] !== "production";

function formatLog(entry: LogEntry): void {
  if (isDev) {
    const prefix = `[${entry.level.toUpperCase()}]`;
    if (entry.context) {
      console[entry.level === "debug" ? "log" : entry.level](
        prefix,
        entry.message,
        entry.context,
      );
    } else {
      console[entry.level === "debug" ? "log" : entry.level](
        prefix,
        entry.message,
      );
    }
  } else {
    // 本番: JSON構造化ログ（info以上のみ）
    if (entry.level !== "debug") {
      console[entry.level === "info" ? "log" : entry.level](
        JSON.stringify(entry),
      );
    }
  }
}

/**
 * 統一ロガー
 *
 * @example
 * logger.error('Failed to save', { userId, error: e.message })
 * logger.warn('Deprecated API called')
 * logger.info('User logged in', { userId })
 * logger.debug('Processing item', { itemId }) // 開発環境のみ
 */
export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => {
    formatLog({
      level: "debug",
      message,
      context,
      timestamp: new Date().toISOString(),
    });
  },
  info: (message: string, context?: Record<string, unknown>) => {
    formatLog({
      level: "info",
      message,
      context,
      timestamp: new Date().toISOString(),
    });
  },
  warn: (message: string, context?: Record<string, unknown>) => {
    formatLog({
      level: "warn",
      message,
      context,
      timestamp: new Date().toISOString(),
    });
  },
  error: (message: string, context?: Record<string, unknown>) => {
    formatLog({
      level: "error",
      message,
      context,
      timestamp: new Date().toISOString(),
    });
  },
};
