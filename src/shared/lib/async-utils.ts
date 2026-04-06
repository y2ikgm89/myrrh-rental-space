/**
 * 非同期処理ユーティリティ
 *
 * Promiseの火消し・エラーハンドリングを統一
 */

import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "./errors/server";

interface FireAndForgetOptions {
  /** 操作名（ログ用） */
  operation: string;
  /** エラーカテゴリ */
  category?: ErrorCategory;
  /** エラー重要度 */
  severity?: ErrorSeverity;
  /** 追加コンテキスト */
  context?: Record<string, unknown>;
}

/**
 * Promiseを「発射して忘れる」ための関数
 *
 * エラーが発生した場合は適切にログに記録し、
 * unhandled rejection を防ぐ
 *
 * @example
 * // メール送信（結果を待たない）
 * fireAndForget(
 *   sendEmail({ to, subject, body }),
 *   { operation: 'sendReservationEmail' }
 * )
 */
export function fireAndForget<T>(
  promise: Promise<T>,
  options: FireAndForgetOptions,
): void {
  promise.catch((err) => {
    logError(normalizeError(err), {
      category: options.category ?? ErrorCategory.UNKNOWN,
      severity: options.severity ?? ErrorSeverity.LOW,
      context: {
        operation: options.operation,
        ...options.context,
      },
    });
  });
}

/**
 * 複数のPromiseを並列実行し、個別のエラーをログに記録
 *
 * すべてのPromiseが完了するまで待機し、
 * 成功・失敗の結果を返す
 */
export async function settleAllWithLogging<T>(
  promises: Promise<T>[],
  options: Omit<FireAndForgetOptions, "operation"> & {
    operationPrefix: string;
  },
): Promise<PromiseSettledResult<T>[]> {
  const results = await Promise.allSettled(promises);

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      logError(normalizeError(result.reason), {
        category: options.category ?? ErrorCategory.UNKNOWN,
        severity: options.severity ?? ErrorSeverity.LOW,
        context: {
          operation: `${options.operationPrefix}[${index}]`,
          ...options.context,
        },
      });
    }
  });

  return results;
}

/**
 * タイムアウト付きPromise実行
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage = "Operation timed out",
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
}
