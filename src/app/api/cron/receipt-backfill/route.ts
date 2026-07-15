import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { backfillReceipts } from "@/shared/domain/receipts/backfill";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

/**
 * cron: 領収書 (Receipt) 未発行の PAID / PARTIALLY_REFUNDED 予約・イベント申込を
 * バッチ発行する。
 *
 * Foundation gap analysis (2026-07-15) task #7 receipt-full-wiring PR#7 (backfill 部分)。
 * 目的: webhook 経由の自動発行 (PR#1-#2) より前に確定した既存 PAID レコードの Receipt
 * を後追いで発行する。日次実行を想定。
 *
 * Feature Module: `payment` OFF なら skip (Stripe 決済自体が無効化されている環境で
 * receipt 発行を試みる意味がない)。
 *
 * 冪等契約: `issueReceiptFor*` は `@unique` + advisory lock 728353 で at-least-once
 * 呼出でも重複発行なし。cron の retry (最大 3 回) でも安全。
 */
export async function GET(request: Request) {
  try {
    await connection();
    const authResult = await authorizeCronRequest({
      request,
      operation: "receiptBackfillCron",
    });
    if (authResult) return authResult;

    if (!(await isFeatureEnabled("payment"))) {
      return jsonSuccess({ skipped: true, reason: "feature_disabled" });
    }

    const summary = await backfillReceipts();

    // Codex P2 対応: row-level エラーが 1 件以上あれば 500 を返して Cloud Scheduler の
    // exponential backoff retry (max_retry_attempts=3) をトリガーする。
    // - `errorReservations` / `errorEventRegistrations` は VALIDATION 以外の実 error
    //   (DB 一時障害 / 予期しない domain 例外 / ネットワーク等) をカウント済
    // - issueReceipt* は冪等 (@unique + advisory lock 728353) のため retry で重複発行なし
    // - 200 で返すと Cloud Scheduler が「成功」と解釈 → 次回日次実行まで transient error が
    //   放置される。日次 03:15 JST 実行のため最悪 24h の遅延を防ぐ
    const totalErrors =
      summary.errorReservations + summary.errorEventRegistrations;
    if (totalErrors > 0) {
      logError(
        new Error(
          `Receipt backfill completed with ${totalErrors} row-level errors`,
        ),
        {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.HIGH,
          context: { operation: "receiptBackfillCron", summary },
        },
      );
      return jsonError(
        `Receipt backfill had ${totalErrors} errors — Cloud Scheduler will retry with backoff`,
        500,
      );
    }
    return jsonSuccess(summary);
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "receiptBackfillCron" },
    });
    return jsonError("Receipt backfill failed", 500);
  }
}
