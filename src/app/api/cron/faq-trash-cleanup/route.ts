/**
 * FAQ Recycle Bin 自動パージ Cron
 *
 * 30 日経過したソフトデリート済みの FAQ カテゴリ・質問を完全削除する。
 * Cloud Scheduler から daily で起動する想定。
 *
 * 認証: `CRON_SECRET` の Authorization Bearer ヘッダー
 * べき等性: 対象がなければ 0 件削除で正常終了
 *
 * 参照実装: `src/app/api/cron/notification-cleanup/route.ts`
 */

import { unstable_rethrow } from "next/navigation";
import { permanentlyDeleteExpiredFaqTrash } from "@/shared/domain/faq/analytics-commands";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { serverEnv } from "@/shared/lib/env/server";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { logger } from "@/shared/lib/logger";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

const RETENTION_DAYS = 30;

export async function GET(request: Request) {
  try {
    const authResult = authorizeCronRequest({
      authorizationHeader: request.headers.get("authorization"),
      secret: serverEnv.CRON_SECRET,
      nodeEnv: serverEnv.NODE_ENV,
      operation: "faqTrashCleanup",
    });
    if (authResult) return authResult;

    // Feature module gate — faq OFF なら早期 return
    if (!(await isFeatureEnabled("faq"))) {
      return jsonSuccess({ skipped: true, reason: "feature_disabled" });
    }

    const result = await permanentlyDeleteExpiredFaqTrash(RETENTION_DAYS);

    logger.info("FAQ trash cleanup completed", {
      categoriesDeleted: result.categoriesDeleted,
      itemsDeleted: result.itemsDeleted,
      retentionDays: RETENTION_DAYS,
    });

    return jsonSuccess({
      categoriesDeleted: result.categoriesDeleted,
      itemsDeleted: result.itemsDeleted,
      retentionDays: RETENTION_DAYS,
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "faqTrashCleanup" },
    });
    return jsonError("Cleanup failed", 500);
  }
}
