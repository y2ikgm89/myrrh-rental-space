/**
 * 顧客の不審な予約パターン検知 Cron
 *
 * 短時間の高頻度予約作成・繰り返しキャンセル・NO_SHOW多発を検知し、
 * Customer.flaggedForReviewAt/flagReasons に反映して管理者通知を生成する。
 * Cloud Scheduler から weekly（月曜 09:00 JST）で起動する想定
 * （faq-stale-check と同じスケジュール、DEDUP_DAYS も同型）。
 *
 * feature module gate は意図的に設けない。reservation/events いずれかが
 * 有効なら検知対象データが存在し得るため、単一モジュールへの紐付けが不適切。
 *
 * 自動でBLACKLIST化・予約拒否はしない。検知結果はフラグ付与のみで、
 * 最終判断は常に管理者（顧客一覧の「要注意」フィルタ・詳細画面から確認する）。
 *
 * 認証: Cloud Scheduler OIDC token
 * 重複通知抑制: 直近 `DEDUP_DAYS` 日以内に同 type の通知があればスキップ
 */

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import {
  applyRiskFlagsCommand,
  detectSuspiciousCustomers,
} from "@/shared/domain/customers/risk-detection";
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

/** 同 type の通知を重複生成しないためのルックバック日数（週次スケジュールより 1 日短い） */
const DEDUP_DAYS = 6;

export async function GET(request: Request) {
  try {
    await connection();
    const authResult = await authorizeCronRequest({
      request,
      operation: "customerRiskScan",
    });
    if (authResult) return authResult;

    // 重複抑制: 直近 6 日以内に同 type 通知が既にあれば no-op（Scheduler 再試行・手動再実行対策）
    if (
      await hasRecentNotificationOfType(
        NOTIFICATION_TYPE.CUSTOMER_FLAGGED,
        DEDUP_DAYS,
      )
    ) {
      logger.info("Customer risk scan: recent notification exists, skipping", {
        dedupDays: DEDUP_DAYS,
      });
      return jsonSuccess({ skipped: true, reason: "recent_notification" });
    }

    const detected = await detectSuspiciousCustomers();

    if (detected.length === 0) {
      logger.info("Customer risk scan: no suspicious customers detected");
      return jsonSuccess({ detected: 0 });
    }

    await applyRiskFlagsCommand(detected);

    await createNotificationCommand({
      type: NOTIFICATION_TYPE.CUSTOMER_FLAGGED,
      title: `${String(detected.length)}名の顧客に不審な予約パターンを検知しました`,
      message:
        "要注意フラグを付与しました。顧客一覧の「要注意」フィルタから確認してください。",
    });

    logger.info("Customer risk scan completed", {
      detected: detected.length,
    });

    return jsonSuccess({ detected: detected.length });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "customerRiskScan" },
    });
    return jsonError("Customer risk scan failed", 500);
  }
}
