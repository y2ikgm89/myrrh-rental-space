/**
 * FAQ 鮮度チェック Cron
 *
 * 長期間更新されていない公開中 FAQ 項目を検出し、管理者通知を生成する。
 * Cloud Scheduler から weekly（月曜 09:00 JST）で起動する想定。
 *
 * 認証: `CRON_SECRET` の Authorization Bearer ヘッダー
 * 重複通知抑制: 直近 `DEDUP_DAYS` 日以内に同 type の通知があればスキップ（再実行・頻度緩和対応）
 */

import { revalidateTag } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { detectStaleFaqItems } from "@/shared/domain/faq/commands";
import {
  createNotificationCommand,
  hasRecentNotificationOfType,
} from "@/shared/domain/notifications/commands";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { serverEnv } from "@/shared/lib/env/server";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { logger } from "@/shared/lib/logger";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { NOTIFICATION_TYPE } from "@/shared/lib/validations/enums/helpers";

const STALE_DAYS = 180;
const MAX_ITEMS = 20;
/** 同 type の通知を重複生成しないためのルックバック日数（週次スケジュールより 1 日短い） */
const DEDUP_DAYS = 6;

export async function GET(request: Request) {
  try {
    const authResult = authorizeCronRequest({
      authorizationHeader: request.headers.get("authorization"),
      secret: serverEnv.CRON_SECRET,
      nodeEnv: serverEnv.NODE_ENV,
      operation: "faqStaleCheck",
    });
    if (authResult) return authResult;

    // 重複抑制: 直近 6 日以内に同 type 通知が既にあれば no-op（Scheduler 再試行・手動再実行対策）
    if (
      await hasRecentNotificationOfType(NOTIFICATION_TYPE.FAQ_STALE, DEDUP_DAYS)
    ) {
      logger.info("FAQ stale check: recent notification exists, skipping", {
        dedupDays: DEDUP_DAYS,
      });
      return jsonSuccess({ skipped: true, reason: "recent_notification" });
    }

    const stale = await detectStaleFaqItems(STALE_DAYS, MAX_ITEMS);

    if (stale.length === 0) {
      logger.info("FAQ stale check: no stale items", { staleDays: STALE_DAYS });
      return jsonSuccess({ detected: 0, staleDays: STALE_DAYS });
    }

    const sample = stale
      .slice(0, 3)
      .map((item) => `・${item.question}`)
      .join("\n");
    const more = stale.length > 3 ? `\n他 ${stale.length - 3} 件` : "";

    await createNotificationCommand({
      type: NOTIFICATION_TYPE.FAQ_STALE,
      title: `${stale.length} 件の FAQ が ${STALE_DAYS} 日以上更新されていません`,
      message: `長期間更新されていない公開中の FAQ があります。内容の見直しをご検討ください。\n\n${sample}${more}`,
    });

    revalidateTag(CACHE_TAGS.NOTIFICATIONS, CACHE_LIFE.DYNAMIC_DATA);

    logger.info("FAQ stale check completed", {
      detected: stale.length,
      staleDays: STALE_DAYS,
    });

    return jsonSuccess({
      detected: stale.length,
      staleDays: STALE_DAYS,
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "faqStaleCheck" },
    });
    return jsonError("Stale check failed", 500);
  }
}
