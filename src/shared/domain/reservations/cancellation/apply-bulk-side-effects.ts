import "server-only";

import { randomUUID } from "node:crypto";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { prisma } from "@/shared/db/prisma";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { applyCancellationSideEffects } from "@/shared/domain/reservations/cancellation/apply-instance-side-effects";
import {
  fetchInstancesForBulkEmail,
  fetchSeriesForBulkEmail,
} from "@/shared/domain/reservations/cancellation/bulk-fetch";
import type { BulkCancellationSideEffectInput } from "@/shared/domain/reservations/cancellation/bulk-types";
import { channelLabel } from "@/shared/domain/reservations/cancellation/helpers";
import {
  GCAL_SERIES_MASTER_DELETE_FAILED_PREFIX,
  GCAL_SERIES_MASTER_PATCH_FAILED_PREFIX,
  markReservationCalendarSyncError,
} from "@/shared/domain/reservations/calendar-sync";
import {
  resolveRefundPolicy,
  type RefundPolicyResolution,
} from "@/shared/domain/refund/policy";
import {
  deleteGcalMaster,
  getSeriesGcalMasterEventId,
  patchGcalMasterUntil,
} from "@/shared/domain/reservations/series-calendar-outbound";
import {
  sendBulkAdminNotification,
  sendBulkReservationCancelledEmail,
} from "@/shared/lib/email/reservation-emails";
import type { BulkReservationCancelledEmailData } from "@/shared/lib/email/types";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { NOTIFICATION_TYPE } from "@/shared/lib/validations/enums/helpers";

/**
 * series 一括キャンセルの副作用統一実行（Phase B.2 task 12）。
 *
 * `applyBulkCancellation`（cancel-core.ts、DB claim のみ）が確定させた
 * cancelledIds を受けて、以下を順に実行する:
 *
 *   1. 各 instance に対して `applyCancellationSideEffects` を **for-await 順次**発火
 *   2. series の master GCal イベントに対して scope 別の 1 回操作
 *   3. 集約キャンセルメール（顧客向け 1 通 + 管理者向け 1 通）
 *   4. 集約 in-app 通知（1 件、件数付き summary）
 *   5. 集約 AuditLog（resource: "reservation_series"）を 1 レコード
 */
export async function applyBulkCancellationSideEffects(
  input: BulkCancellationSideEffectInput,
): Promise<void> {
  const cancellationReason = input.cancellationReason ?? null;
  const actorUserId = input.actorUserId ?? null;
  const batchNonce = randomUUID();

  let refundPolicySnapshot: RefundPolicyResolution | undefined = undefined;
  try {
    const settings = await prisma.settingsCommerce.findUnique({
      where: { id: "singleton" },
      select: { refundPolicy: true },
    });
    refundPolicySnapshot = resolveRefundPolicy(settings?.refundPolicy);
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "applyBulkCancellationSideEffects.settingsSnapshot",
        seriesId: input.seriesId,
      },
    });
  }

  for (const reservationId of input.reservationIds) {
    try {
      await applyCancellationSideEffects({
        reservationId,
        cancellationReason,
        channel: input.channel,
        actorUserId,
        request: input.request,
        suppress: {
          customerEmail: true,
          adminEmail: true,
          gcalDelete: true,
          inAppNotification: true,
        },
        ...(refundPolicySnapshot !== undefined ? { refundPolicySnapshot } : {}),
      });
    } catch (error) {
      logError(normalizeError(error), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "applyBulkCancellationSideEffects.perInstance",
          reservationId,
          seriesId: input.seriesId,
        },
      });
    }
  }

  try {
    const masterEventId = await getSeriesGcalMasterEventId(input.seriesId);
    if (masterEventId) {
      if (input.scope === "this-and-following") {
        const until = input.gcalUntil ?? input.now;
        const result = await patchGcalMasterUntil({
          masterEventId,
          seriesId: input.seriesId,
          until,
        });
        if (!result.success) {
          const error = `${GCAL_SERIES_MASTER_PATCH_FAILED_PREFIX}${until.toISOString()}|${result.error ?? "unknown error"}`;
          await Promise.all(
            input.reservationIds.map((reservationId) =>
              markReservationCalendarSyncError({ reservationId, error }),
            ),
          );
        }
      } else {
        const result = await deleteGcalMaster(masterEventId);
        if (!result.success) {
          const error = `${GCAL_SERIES_MASTER_DELETE_FAILED_PREFIX}${result.error ?? "unknown error"}`;
          await Promise.all(
            input.reservationIds.map((reservationId) =>
              markReservationCalendarSyncError({ reservationId, error }),
            ),
          );
        }
      }
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "applyBulkCancellationSideEffects.gcalMaster",
        seriesId: input.seriesId,
        scope: input.scope,
      },
    });
  }

  try {
    const series = await fetchSeriesForBulkEmail(input.seriesId);
    if (!series) {
      logError(
        new Error(
          `Bulk cancellation aggregate email skipped: series ${input.seriesId} not found`,
        ),
        {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "applyBulkCancellationSideEffects.email",
            seriesId: input.seriesId,
          },
        },
      );
    } else {
      const instances = await fetchInstancesForBulkEmail(input.reservationIds);
      const emailData: BulkReservationCancelledEmailData = {
        seriesId: input.seriesId,
        customerEmail: series.customer.email,
        customerName:
          `${series.customer.lastName} ${series.customer.firstName}`.trim(),
        spaceName: series.space.name,
        instances,
        batchNonce,
        ...(input.cancellationReason
          ? { reason: input.cancellationReason }
          : {}),
      };

      await sendBulkReservationCancelledEmail(emailData);
      await sendBulkAdminNotification(emailData);
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "applyBulkCancellationSideEffects.email",
        seriesId: input.seriesId,
      },
    });
  }

  try {
    const count = input.reservationIds.length;
    const notificationMessage = cancellationReason
      ? `繰り返し予約 ${String(count)}件をキャンセルしました。理由: ${cancellationReason}`
      : `繰り返し予約 ${String(count)}件をキャンセルしました。理由: 入力なし`;
    await createNotificationCommand({
      type: NOTIFICATION_TYPE.RESERVATION_CANCEL,
      title: `予約キャンセル（${channelLabel(input.channel)}）— ${String(count)}件`,
      message: notificationMessage,
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "applyBulkCancellationSideEffects.notification",
        seriesId: input.seriesId,
        count: input.reservationIds.length,
      },
    });
  }

  try {
    await createAuditLogRecord({
      ...(actorUserId ? { userId: actorUserId } : {}),
      action: AuditAction.UPDATE,
      resource: "reservation_series",
      resourceId: input.seriesId,
      newValue: {
        status: "CANCELLED",
        scope: input.scope,
        cancelledIds: input.reservationIds,
        cancellationReason,
      },
      metadata: {
        channel: input.channel,
        ip: input.request.ip,
        userAgent: input.request.userAgent,
        ...(input.request.tokenFingerprint
          ? { tokenFingerprint: input.request.tokenFingerprint }
          : {}),
      },
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "applyBulkCancellationSideEffects.auditLog",
        seriesId: input.seriesId,
        scope: input.scope,
      },
    });
  }
}
