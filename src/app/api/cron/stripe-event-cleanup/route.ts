import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { cleanupOldStripeEvents } from "@/shared/domain/stripe-events/cleanup";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { logger } from "@/shared/lib/errors/logger-core";
import { withAwaitedSideEffects } from "@/shared/lib/async-utils";

/**
 * cron: StripeEvent table の retention + crash-recovery unblock。
 *
 * ## 実行契約
 * - Cloud Scheduler OIDC Bearer で認可 (fail-closed)
 * - Feature Module gate: 対象外 (Stripe webhook は core payments infra で常時稼働)
 * - 実行頻度: 日次 03:00 JST (低負荷時間帯 / receipt-backfill 03:15 とずらす)
 * - Cache invalidation: 不要 (StripeEvent は cached read の対象外)
 *
 * ## 2 系統の DELETE
 * 1. Retention: 90 日超の `receivedAt` 行を削除 (単調増加防止)
 * 2. Stale unblock: `processedAt IS NULL AND receivedAt < now - 10 分` を削除。
 *    handler crash 時に stuck した dedup row を解放し、Stripe retry で
 *    `create` が `claimed` を返して handler 再実行される経路を開ける
 *    (詳細は `src/shared/domain/stripe-events/dedup.ts` docstring 参照)
 *
 * 冪等: 該当行の全削除完了後に再実行しても no-op (count=0 を返す)。
 */
async function handleGet(request: Request) {
  try {
    await connection();
    const authResult = await authorizeCronRequest({
      request,
      operation: "stripeEventCleanup",
    });
    if (authResult) return authResult;

    const summary = await cleanupOldStripeEvents(new Date());

    logger.info("Stripe event cleanup completed", {
      retention: summary.retention,
      staleUnblock: summary.staleUnblock,
    });

    return jsonSuccess({
      retention: summary.retention,
      staleUnblock: summary.staleUnblock,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "stripeEventCleanup" },
    });
    return jsonError("Stripe event cleanup failed", 500);
  }
}

/**
 * cron service は `cpu_idle = true`（request 課金）なので、レスポンス送信後の
 * `after()` が完走する保証がない。`fireAndForget` の副作用をレスポンス前に
 * 待ち合わせる。cron にレスポンス遅延の要件は無い（Cloud Scheduler の
 * attempt_deadline は 300s）。理由は `withAwaitedSideEffects` の docblock。
 */
export async function GET(request: Request) {
  return withAwaitedSideEffects(() => handleGet(request));
}
