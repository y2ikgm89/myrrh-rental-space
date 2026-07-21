/**
 * 顧客の重複候補検知 Cron
 *
 * emailCanonical または phoneNumber が完全一致する複数顧客を検知し、
 * Customer.flagReasons に DUPLICATE_CANDIDATE を付与して管理者通知を生成する。
 * Cloud Scheduler から daily（毎日 03:00 JST）で起動する想定
 * （faq-trash-cleanup と同じスケジュール、DEDUP_DAYS も同型）。
 *
 * feature module gate は意図的に設けない。顧客データは単一モジュールに
 * 紐付かないため、複数モジュール状態でも検知対象が存在する。
 *
 * 自動マージ・レコード削除はしない。検知結果はフラグ付与のみで、
 * 最終判断は常に管理者（顧客一覧から「重複顧客」フィルタ・詳細画面から確認する）。
 *
 * 認証: Cloud Scheduler OIDC token
 * 重複通知抑制: 直近 `DEDUP_DAYS` 日以内に同 type の通知があればスキップ
 */

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import {
  applyDuplicateCandidateFlagsCommand,
  detectDuplicateCandidates,
} from "@/shared/domain/customers/duplicate-detection";
import {
  createNotificationCommand,
  hasRecentNotificationOfType,
} from "@/shared/domain/notifications/commands";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { logger } from "@/shared/lib/errors/logger-core";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { NOTIFICATION_TYPE } from "@/shared/lib/validations/enums/helpers";

/** 同 type の通知を重複生成しないためのルックバック日数（日次スケジュールより 1 日短い） */
const DEDUP_DAYS = 6;

export async function GET(request: Request) {
  try {
    await connection();
    const authResult = await authorizeCronRequest({
      request,
      operation: "customerDuplicateScan",
    });
    if (authResult) return authResult;

    // 重複抑制: 直近 6 日以内に同 type 通知が既にあれば no-op（Scheduler 再試行・手動再実行対策）
    if (
      await hasRecentNotificationOfType(
        NOTIFICATION_TYPE.CUSTOMER_FLAGGED,
        DEDUP_DAYS,
      )
    ) {
      logger.info(
        "Customer duplicate scan: recent notification exists, skipping",
        {
          dedupDays: DEDUP_DAYS,
        },
      );
      return jsonSuccess({ skipped: true, reason: "recent_notification" });
    }

    const detected = await detectDuplicateCandidates();

    if (detected.length === 0) {
      logger.info("Customer duplicate scan: no duplicate candidates detected");
      return jsonSuccess({ detected: 0 });
    }

    await applyDuplicateCandidateFlagsCommand(detected);

    await createNotificationCommand({
      type: NOTIFICATION_TYPE.CUSTOMER_FLAGGED,
      title: `${String(detected.length)}件の重複顧客候補を検知しました`,
      message:
        "重複の疑いがあるフラグを付与しました。顧客一覧から確認してください。",
    });

    logger.info("Customer duplicate scan completed", {
      detected: detected.length,
    });

    return jsonSuccess({ detected: detected.length });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "customerDuplicateScan" },
    });
    return jsonError("Customer duplicate scan failed", 500);
  }
}
