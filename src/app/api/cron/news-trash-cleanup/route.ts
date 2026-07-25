/**
 * News Recycle Bin 自動パージ Cron
 *
 * 30 日経過したソフトデリート済みのお知らせを完全削除する。
 * Cloud Scheduler から daily で起動する想定。
 *
 * 認証: Cloud Scheduler OIDC token
 * べき等性: 対象がなければ 0 件削除で正常終了
 *
 * 参照実装: `src/app/api/cron/faq-trash-cleanup/route.ts`
 */

import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { permanentlyDeleteExpiredNewsTrash } from "@/shared/domain/news/trash-commands";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { logger } from "@/shared/lib/errors/logger-core";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";

const RETENTION_DAYS = 30;

export async function GET(request: Request) {
  try {
    await connection();
    const authResult = await authorizeCronRequest({
      request,
      operation: "newsTrashCleanup",
    });
    if (authResult) return authResult;

    if (!(await isFeatureEnabled("news"))) {
      return jsonSuccess({ skipped: true, reason: "feature_disabled" });
    }

    const result = await permanentlyDeleteExpiredNewsTrash(RETENTION_DAYS);

    logger.info("News trash cleanup completed", {
      deleted: result.deleted,
      retentionDays: RETENTION_DAYS,
    });

    return jsonSuccess({
      deleted: result.deleted,
      retentionDays: RETENTION_DAYS,
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "newsTrashCleanup" },
    });
    return jsonError("Cleanup failed", 500);
  }
}
