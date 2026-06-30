import { unstable_rethrow } from "next/navigation";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { deleteOldNotificationsCommand } from "@/shared/domain/notifications/commands";
import { serverEnv } from "@/shared/lib/env/server";
import { authorizeCronRequest } from "@/shared/lib/cron-auth";
import { jsonError, jsonSuccess } from "@/shared/lib/route-responses";
import { logger } from "@/shared/lib/errors/logger-core";

const RETENTION_DAYS = 30;

export async function GET(request: Request) {
  try {
    const authResult = authorizeCronRequest({
      authorizationHeader: request.headers.get("authorization"),
      secret: serverEnv.CRON_SECRET,
      nodeEnv: serverEnv.NODE_ENV,
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
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "notificationCleanup" },
    });
    return jsonError("Cleanup failed", 500);
  }
}
