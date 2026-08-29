/**
 * 予約確認メールの取りこぼし回収 Cron
 *
 * `Reservation.confirmationEmailPendingAt` が猶予（10 分）を過ぎても残っている
 * 予約に、確認メールを送り直す。
 *
 * ## なぜ要るか
 *
 * 確認メールは `applyConfirmationSideEffects` が SwitchBot パスコードの確定を
 * 最大 150 秒待ってから送る。Cloud Run の SIGTERM 猶予は 10 秒しかないので、
 * その間にインスタンスが停止すると送信自体が失われる。パスコードは webhook と
 * `smart-lock-cleanup` が回復するが、メールにはこの route 以外の受け皿が無い。
 *
 * 認証: Cloud Scheduler OIDC token
 * べき等性: 対象がなければ 0 件で正常終了。二重送信は Resend の idempotency key
 * （`reservation-confirm/<reservationId>/<icsSequence>`）が吸収する。
 *
 * 参照実装: `src/app/api/cron/receipt-backfill/route.ts`
 */

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { processPendingReservationConfirmationEmails } from "@/shared/domain/reservations/confirmation-email-pending";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { logger } from "@/shared/lib/errors/logger-core";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { withAwaitedSideEffects } from "@/shared/lib/async-utils";

async function handleGet(request: Request) {
  try {
    await connection();
    const authResult = await authorizeCronRequest({
      request,
      operation: "confirmationEmailBackfill",
    });
    if (authResult) return authResult;

    if (!(await isFeatureEnabled("reservation"))) {
      return jsonSuccess({ skipped: true, reason: "feature_disabled" });
    }

    const result = await processPendingReservationConfirmationEmails();

    logger.info("Reservation confirmation email backfill completed", {
      candidates: result.candidates,
      sent: result.sent,
    });

    return jsonSuccess(result);
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "confirmationEmailBackfill" },
    });
    return jsonError("Confirmation email backfill failed", 500);
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
