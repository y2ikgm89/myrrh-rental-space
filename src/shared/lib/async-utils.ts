/**
 * 非同期処理ユーティリティ
 *
 * Promiseの火消し・エラーハンドリングを統一
 */

import { after } from "next/server";
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
 * レスポンスをブロックせずに副作用（メール送信・監査ログ・カレンダー同期など）を
 * 実行する。完了の追跡を Next.js の `after()` に委譲することで、レスポンス送信後も
 * ランタイムが処理の完了を待ってからインスタンスを終了する（Cloud Run の
 * `--no-cpu-throttling` 環境で deploy / scale-down 時の graceful drain 中も
 * 確実に完走し、デタッチされた Promise が黙ってドロップされる事故を防ぐ）。
 *
 * `after()` はリクエストスコープ外（ユニットテスト・非リクエスト文脈）で呼ばれると
 * 同期的に throw するため、その場合は従来どおりデタッチされた Promise として実行する
 * フォールバックに切り替える。いずれの経路でもエラーは `logError` に集約し、
 * unhandled rejection を防ぐ。
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
  // promise は呼び出し側で既に実行開始済み。ここでは完了の追跡のみを行う。
  // エラーは内部で握りつぶしてログ化するため、guarded は決して reject しない。
  const guarded = promise.catch((err) => {
    logError(normalizeError(err), {
      category: options.category ?? ErrorCategory.UNKNOWN,
      severity: options.severity ?? ErrorSeverity.LOW,
      context: {
        operation: options.operation,
        ...options.context,
      },
    });
  });

  try {
    // リクエストスコープ内: レスポンス完了後にランタイムが guarded の完了を待つ。
    after(() => guarded);
  } catch {
    // リクエストスコープ外: 従来どおりデタッチ実行（guarded は catch 済みで安全）。
    void guarded;
  }
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
