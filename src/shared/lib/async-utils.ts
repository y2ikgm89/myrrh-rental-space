/**
 * 非同期処理ユーティリティ
 *
 * Promiseの火消し・エラーハンドリングを統一
 */

import { AsyncLocalStorage } from "node:async_hooks";
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

interface SideEffectScope {
  /** `fireAndForget` が積んだ guarded promise。catch 済みなので reject しない。 */
  promises: Promise<unknown>[];
}

/**
 * `withAwaitedSideEffects` が張るリクエストスコープ。
 * スコープが無いとき `fireAndForget` は従来どおり `after()` に委ねる。
 */
const sideEffectScope = new AsyncLocalStorage<SideEffectScope>();

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
 * **例外は `withAwaitedSideEffects` のスコープ内**で、そのときだけ `after()` に
 * 載せずコレクタへ積み、呼び出し側がレスポンスを返す前に待ち合わせる。cron
 * service は `cpu_idle = true` で `after()` の完走が保証されないため（詳細は
 * `withAwaitedSideEffects` の docblock）。
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

  // `withAwaitedSideEffects` のスコープ内なら、`after()` に載せずコレクタへ積む。
  // レスポンスを返す前に呼び出し側が待ち合わせる（下の docblock を参照）。
  const scope = sideEffectScope.getStore();
  if (scope) {
    scope.promises.push(guarded);
    return;
  }

  try {
    // リクエストスコープ内: レスポンス完了後にランタイムが guarded の完了を待つ。
    after(() => guarded);
  } catch {
    // リクエストスコープ外: 従来どおりデタッチ実行（guarded は catch 済みで安全）。
    void guarded;
  }
}

/**
 * `fireAndForget` の副作用をレスポンス前に待ち合わせるスコープを張る。
 *
 * ## なぜ必要か
 *
 * `fireAndForget` の既定は `after()` で、**レスポンス送信後**に走る。これは
 * Cloud Run の `--no-cpu-throttling`（`cpu_idle = false`）を前提にした設計で、
 * public / admin service ではその前提が保たれている。
 *
 * cron service だけは `cpu_idle = true`（request 課金）なので前提が崩れる —
 * レスポンス送信後は CPU がスロットルされ、インスタンス終了までに `after()` の
 * 処理が終わる保証がない。cron にはレスポンス遅延の要件が無いので、**待ってから
 * 返す**のが正しい。理由と費用の内訳は
 * `docs/superpowers/plans/2026-08-27-cron-surface-separation.md`。
 *
 * ## なぜ呼び出し側を書き換えないのか
 *
 * 「defer するか await するか」は**サーフェスごとの判断**であって、副作用を
 * 起こすモジュールの性質ではない。`reservation-calendar-outbound` などの共有
 * ドメイン層は cron からもユーザー操作からも呼ばれ、後者では defer が正しい
 * （予約フォームのレスポンスをカレンダー同期でブロックしない）。呼び出し側を
 * `await` に書き換えると、その正しさを壊す。
 *
 * `AsyncLocalStorage` を使うのは `shared/lib/cache/batcher.ts` と同じ理由で、
 * Next.js が per-request scope に用いる documented pattern だから。
 *
 * ## 待ち合わせの形
 *
 * 積まれた promise は `fireAndForget` が catch 済みなので **reject しない**。
 * 副作用がさらに副作用を積む場合があるため、空になるまで繰り返し drain する。
 * ネストした呼び出しは親スコープを共有し、二重待ちにならない。
 */
export async function withAwaitedSideEffects<T>(
  fn: () => Promise<T>,
): Promise<T> {
  // ネスト時は親スコープを共有する（batcher.ts の withPurgeBatch と同型）。
  if (sideEffectScope.getStore()) {
    return fn();
  }

  const scope: SideEffectScope = { promises: [] };

  // drain は `run()` の内側に置く。ALS の context は promise の継続に沿って
  // 伝播するので、外側に置いても実測では差が出なかった（変異検査で確認済み）。
  // 内側なのは「スコープの寿命 = 待ち合わせの完了」を配置で示すためで、
  // 既知の漏れを塞いでいるわけではない。
  return sideEffectScope.run(scope, async () => {
    try {
      return await fn();
    } finally {
      // 副作用が副作用を積むことがあるので、空になるまで繰り返す。
      while (scope.promises.length > 0) {
        await Promise.all(scope.promises.splice(0));
      }
    }
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
