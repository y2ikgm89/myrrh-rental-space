import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  createNotificationCommand,
  hasRecentNotificationOfType,
} from "@/shared/domain/notifications/commands";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";

/**
 * PERMISSION_DENIED の多発を検知して SUPER_ADMIN に通知する。
 *
 * VIEWER/EDITOR が UI 上まだ隠れていないリンクを踏む等の正常系ノイズもあるため、
 * 単発では通知しない。同一ユーザーが短時間に閾値を超えて弾かれた場合のみ、
 * アカウント侵害・権限昇格試行の可能性として扱う。
 */
const PERMISSION_DENIED_SPIKE_WINDOW_MS = 15 * 60 * 1000;
const PERMISSION_DENIED_SPIKE_THRESHOLD = 5;
// hasRecentNotificationOfType は「日数」引数だが Date 演算としては分数も正しく動く
// （faq-stale-check 等と異なり短時間の再送抑制が必要なため 6 時間相当を渡す）。
const PERMISSION_DENIED_NOTIFICATION_DEDUPE_DAYS = 0.25;

export async function notifyPermissionDeniedSpikeIfNeeded(
  userId: string,
): Promise<void> {
  try {
    const recentCount = await prisma.auditLog.count({
      where: {
        userId,
        action: AuditAction.PERMISSION_DENIED,
        createdAt: {
          gte: new Date(Date.now() - PERMISSION_DENIED_SPIKE_WINDOW_MS),
        },
      },
    });
    if (recentCount < PERMISSION_DENIED_SPIKE_THRESHOLD) return;

    const alreadyNotified = await hasRecentNotificationOfType(
      NOTIFICATION_TYPE.SECURITY_PERMISSION_DENIED,
      PERMISSION_DENIED_NOTIFICATION_DEDUPE_DAYS,
    );
    if (alreadyNotified) return;

    await createNotificationCommand({
      type: NOTIFICATION_TYPE.SECURITY_PERMISSION_DENIED,
      title:
        NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.SECURITY_PERMISSION_DENIED],
      message: `直近15分で同一ユーザーの権限エラーが${recentCount.toString()}件発生しています。アカウント侵害や権限昇格試行の可能性を確認してください。`,
      resourceType: "user",
      resourceId: userId,
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "notifyPermissionDeniedSpikeIfNeeded",
        userId,
      },
    });
  }
}
