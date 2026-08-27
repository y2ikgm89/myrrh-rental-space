import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { deleteOldNotificationsCommand } from "@/shared/domain/notifications/commands";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { logger } from "@/shared/lib/errors/logger-core";
import { withAwaitedSideEffects } from "@/shared/lib/async-utils";

const RETENTION_DAYS = 30;

async function handleGet(request: Request) {
  try {
    await connection();
    const authResult = await authorizeCronRequest({
      request,
      operation: "notificationCleanup",
    });
    if (authResult) return authResult;

    const deletedCount = await deleteOldNotificationsCommand(RETENTION_DAYS);

    logger.info("Notification cleanup completed", {
      deletedCount,
      retentionDays: RETENTION_DAYS,
    });

    return jsonSuccess({ deletedCount, retentionDays: RETENTION_DAYS });
  } catch (error) {
    unstable_rethrow(error);
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "notificationCleanup" },
    });
    return jsonError("Cleanup failed", 500);
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
