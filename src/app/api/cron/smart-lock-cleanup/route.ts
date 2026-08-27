/**
 * SwitchBotスマートロック パスコード失効クリーンアップ Cron API
 *
 * `endTime`経過済み、または紐づく予約がCANCELLEDになったCONFIRMEDパスコードを
 * deleteKeyで失効させる。予約キャンセル時の即時deleteKey（失敗し得る）の
 * フォールバック回収も兼ねる。
 *
 * @module api/cron/smart-lock-cleanup
 */

import { withAwaitedSideEffects } from "@/shared/lib/async-utils";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { getSwitchBotEnabled } from "@/shared/domain/settings/api-key-queries";
import {
  expireStalePendingSmartLockPasscodes,
  expireStaleRevokePendingSmartLockPasscodes,
  findStuckSmartLockPasscodesWhenIntegrationDisabled,
  revokeExpiredSmartLockPasscodes,
} from "@/shared/domain/smart-lock/revoke-passcode";
import { processPendingSmartLockReissues } from "@/shared/domain/smart-lock/reissue-passcode";
import {
  logError,
  normalizeError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

async function handleGet(request: Request) {
  try {
    await connection();
    const authorizationResult = await authorizeCronRequest({
      request,
      operation: "smartLockCleanupCron",
    });
    if (authorizationResult) {
      return authorizationResult;
    }

    const now = new Date();

    // Stale PENDING / REVOKE_PENDING の救済は SwitchBot 連携 ON/OFF に関わらず実施する。
    // 資格情報が復号できれば Device List 照合と deleteKey を外部 API で試み、
    // 復号できない（または物理 key が無い）PENDING を FAILED へ倒して
    // `@@unique([reservationId, deviceId])` 下の orphan を残さない。
    // stale REVOKE_PENDING は DB のみで CONFIRMED に戻し、deleteKey を再試行可能にする。
    // 詳細は revoke-passcode.ts の JSDoc 参照。
    const stalePendingExpired = await expireStalePendingSmartLockPasscodes(now);
    const staleRevokePendingReverted =
      await expireStaleRevokePendingSmartLockPasscodes(now);

    const enabled = await getSwitchBotEnabled();
    if (!enabled) {
      // SwitchBot連携が無効でも、失効すべき CONFIRMED / REVOKE_PENDING パスコードの
      // 蓄積は DB のみの読取(外部API呼出無し)で検知できる。
      const stuck =
        await findStuckSmartLockPasscodesWhenIntegrationDisabled(now);
      if (stuck.length > 0) {
        logError(
          new Error(
            "SwitchBot連携が無効な間に失効待ちのパスコードが蓄積しています",
          ),
          {
            category: ErrorCategory.VALIDATION,
            severity: ErrorSeverity.HIGH,
            context: {
              operation: "smartLockCleanupCron",
              stuckCount: stuck.length,
              stalePendingExpired,
              staleRevokePendingReverted,
            },
          },
        );
      }
      return jsonSuccess({
        skipped: true,
        reason: "switchbot_disabled",
        stuckCount: stuck.length,
        stalePendingExpired,
        staleRevokePendingReverted,
      });
    }

    const { revoked, failed } = await revokeExpiredSmartLockPasscodes(now);

    const pendingReissues = await processPendingSmartLockReissues(now);

    if (failed > 0) {
      logError(new Error("Some SwitchBot passcodes failed to revoke"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "smartLockCleanupCron",
          revoked,
          failed,
          stalePendingExpired,
          staleRevokePendingReverted,
        },
      });
      return jsonError("Some SwitchBot passcodes failed to revoke", 500);
    }

    return jsonSuccess({
      revoked,
      failed,
      stalePendingExpired,
      staleRevokePendingReverted,
      pendingReissues,
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.HIGH,
      context: { operation: "smartLockCleanupCron" },
    });
    return jsonError("Internal error", 500);
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
