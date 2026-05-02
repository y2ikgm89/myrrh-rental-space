"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import { ReservationStatus } from "@/shared/lib/validations/enums/prisma-types";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  deleteReservationCommand,
  restoreReservationCommand,
  restoreReservationStatusCommand,
  updateReservationNotesCommand,
  updateReservationStatusCommand,
} from "@/shared/domain/reservations/lifecycle-commands";
import { Role } from "@/shared/lib/validations/enums/prisma-types";
import { updateCustomerFromGuestData } from "@/shared/domain/customers/commands";
import { getReservationGuestData } from "@/shared/domain/reservations/admin-queries";
import { DomainError } from "@/shared/domain/domain-error";
import { createMutationError } from "@/shared/lib/mutation-result";
import {
  syncReservationToCalendar,
  updateCalendarSync,
  deleteCalendarSync,
} from "@/shared/lib/calendar-sync/outbound";
import type { ReservationSyncData } from "@/shared/lib/calendar-sync/types";
import {
  sendReservationAdminNotification,
  sendReservationCancelledEmail,
  sendReservationConfirmationEmail,
  sendReservationStatusChangedEmail,
} from "@/shared/lib/email/reservation-emails";
import {
  RESERVATION_STATUS_LABELS,
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";

const updateStatusSchema = z.object({
  id: z.string().uuid({ error: "IDが不正です" }),
  status: z.enum(ReservationStatus),
});

const updateNotesSchema = z.object({
  id: z.string().uuid({ error: "IDが不正です" }),
  notes: z.string().max(1000).nullable(),
});

const restoreStatusSchema = z.object({
  id: z.string().uuid({ error: "IDが不正です" }),
  targetStatus: z.enum(ReservationStatus),
});

export const updateReservationStatus = async (
  id: string,
  status: ReservationStatus,
) => {
  const parsed = updateStatusSchema.safeParse({ id, status });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  let result:
    | Awaited<ReturnType<typeof updateReservationStatusCommand>>
    | undefined;

  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: id,
    execute: async () => {
      result = await updateReservationStatusCommand(id, status);
      return null;
    },
    afterSuccess: () => {
      if (!result) {
        return;
      }

      const payloadData = omitUndefined(result.payload);
      const calendarData: ReservationSyncData = payloadData;

      if (
        status === ReservationStatus.CONFIRMED &&
        result.previousStatus !== ReservationStatus.CONFIRMED
      ) {
        if (result.googleCalendarEventId) {
          fireAndForget(
            updateCalendarSync(calendarData, result.googleCalendarEventId),
            {
              operation: "updateCalendarSync",
              category: ErrorCategory.EXTERNAL_API,
              severity: ErrorSeverity.LOW,
              context: { reservationId: id },
            },
          );
        } else {
          fireAndForget(syncReservationToCalendar(calendarData), {
            operation: "syncReservationToCalendar",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
            context: { reservationId: id },
          });
        }

        fireAndForget(
          Promise.all([
            sendReservationConfirmationEmail(payloadData),
            sendReservationAdminNotification(
              payloadData,
              result.previousStatus === ReservationStatus.PENDING
                ? "new"
                : "update",
            ),
          ]),
          {
            operation: "sendConfirmationEmails",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.MEDIUM,
            context: { reservationId: id },
          },
        );
      }

      if (
        status === ReservationStatus.CANCELLED &&
        result.previousStatus !== ReservationStatus.CANCELLED
      ) {
        if (result.googleCalendarEventId) {
          fireAndForget(deleteCalendarSync(id, result.googleCalendarEventId), {
            operation: "deleteCalendarSync",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
            context: { reservationId: id },
          });
        }

        fireAndForget(
          Promise.all([
            sendReservationCancelledEmail(payloadData),
            sendReservationAdminNotification(payloadData, "cancel"),
          ]),
          {
            operation: "sendCancellationEmails",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.MEDIUM,
            context: { reservationId: id },
          },
        );

        fireAndForget(
          createNotificationCommand({
            type: NOTIFICATION_TYPE.RESERVATION_CANCEL,
            title:
              NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_CANCEL],
            message: `予約がキャンセルされました`,
            resourceType: "reservation",
            resourceId: id,
          }),
          {
            operation: "createCancelNotification",
            category: ErrorCategory.DATABASE,
          },
        );
      }

      // 確認・キャンセル以外のステータス変更（完了、無断キャンセル等）は汎用通知メール
      if (
        result.previousStatus !== status &&
        status !== ReservationStatus.CONFIRMED &&
        status !== ReservationStatus.CANCELLED
      ) {
        const oldLabel =
          RESERVATION_STATUS_LABELS[result.previousStatus] ??
          result.previousStatus;
        const newLabel = RESERVATION_STATUS_LABELS[status] ?? status;

        fireAndForget(
          sendReservationStatusChangedEmail({
            reservationId: payloadData.reservationId,
            customerEmail: payloadData.customerEmail,
            customerName: payloadData.customerName,
            spaceName: payloadData.spaceName,
            startTime: payloadData.startTime,
            endTime: payloadData.endTime,
            totalPrice: payloadData.totalPrice,
            oldStatus: oldLabel,
            newStatus: newLabel,
            icsSequence: payloadData.icsSequence,
            ...(payloadData.location != null
              ? { location: payloadData.location }
              : {}),
          }),
          {
            operation: "sendReservationStatusChangedEmail",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.MEDIUM,
            context: { reservationId: id },
          },
        );
      }

      const isCancellation =
        status === ReservationStatus.CANCELLED &&
        result.previousStatus !== ReservationStatus.CANCELLED;
      invalidateReservationCaches(id, result.customerId, {
        coupons: isCancellation && result.couponId !== null,
        notifications: isCancellation,
      });
    },
  });
};

/**
 * 終端ステータス（COMPLETED / CANCELLED / NO_SHOW）から非終端ステータスへの復元。
 * SUPER_ADMIN のみ実行可能（誤操作からの巻き戻し用途）。
 *
 * - CANCELLED → CONFIRMED の場合は時間帯コンフリクトを検証（domain command 内）
 * - CONFIRMED へ復元する場合は GCal 再同期 + 顧客通知メール
 * - 監査ログには `update` action として記録（restore は意味ある変更）
 */
export const restoreReservationStatus = async (
  id: string,
  targetStatus: ReservationStatus,
) => {
  const parsed = restoreStatusSchema.safeParse({ id, targetStatus });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  let result:
    | Awaited<ReturnType<typeof restoreReservationStatusCommand>>
    | undefined;

  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: id,
    execute: async (user) => {
      if (user.role !== Role.SUPER_ADMIN) {
        throw new DomainError(
          "ステータスの復元は SUPER_ADMIN のみ実行できます",
          "FORBIDDEN",
        );
      }
      result = await restoreReservationStatusCommand(
        id,
        parsed.data.targetStatus,
      );
      return null;
    },
    afterSuccess: () => {
      if (!result) return;

      const payloadData = omitUndefined(result.payload);
      const calendarData: ReservationSyncData = payloadData;

      if (result.targetStatus === ReservationStatus.CONFIRMED) {
        if (result.googleCalendarEventId) {
          fireAndForget(
            updateCalendarSync(calendarData, result.googleCalendarEventId),
            {
              operation: "restoreCalendarSync",
              category: ErrorCategory.EXTERNAL_API,
              severity: ErrorSeverity.LOW,
              context: { reservationId: id },
            },
          );
        } else {
          fireAndForget(syncReservationToCalendar(calendarData), {
            operation: "restoreSyncReservationToCalendar",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
            context: { reservationId: id },
          });
        }
      }

      const oldLabel =
        RESERVATION_STATUS_LABELS[result.previousStatus] ??
        result.previousStatus;
      const newLabel =
        RESERVATION_STATUS_LABELS[result.targetStatus] ?? result.targetStatus;

      fireAndForget(
        sendReservationStatusChangedEmail({
          reservationId: payloadData.reservationId,
          customerEmail: payloadData.customerEmail,
          customerName: payloadData.customerName,
          spaceName: payloadData.spaceName,
          startTime: payloadData.startTime,
          endTime: payloadData.endTime,
          totalPrice: payloadData.totalPrice,
          oldStatus: oldLabel,
          newStatus: newLabel,
          icsSequence: payloadData.icsSequence,
          ...(payloadData.location != null
            ? { location: payloadData.location }
            : {}),
        }),
        {
          operation: "restoreSendStatusChangedEmail",
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: { reservationId: id },
        },
      );

      invalidateReservationCaches(id, result.customerId, {
        notifications: true,
      });
    },
  });
};

export const updateReservationNotes = async (
  id: string,
  notes: string | null,
): Promise<MutationResult> => {
  const parsed = updateNotesSchema.safeParse({ id, notes });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: id,
    execute: async () => {
      await updateReservationNotesCommand(id, notes);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.RESERVATIONS);
      updateTag(getCacheTag.reservations.detail(id));
      updateTag(getCacheTag.reservations.calendar());
    },
  });
};

export const deleteReservation = async (
  id: string,
): Promise<MutationResult> => {
  const parsed = z.string().uuid({ error: "IDが不正です" }).safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  let deleteResult:
    | Awaited<ReturnType<typeof deleteReservationCommand>>
    | undefined;

  return executeAdminMutationResult({
    resource: "reservation",
    action: "delete",
    resourceId: id,
    execute: async (user) => {
      deleteResult = await deleteReservationCommand(id, user.id);
      return null;
    },
    afterSuccess: () => {
      if (!deleteResult) return;
      if (deleteResult.googleCalendarEventId) {
        fireAndForget(
          deleteCalendarSync(id, deleteResult.googleCalendarEventId),
          {
            operation: "deleteCalendarSync",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
            context: { reservationId: id, trigger: "deleteReservation" },
          },
        );
      }

      invalidateReservationCaches(id, deleteResult.customerId, {
        coupons: deleteResult.couponId !== null,
      });
    },
  });
};

export const restoreReservation = async (
  id: string,
): Promise<MutationResult> => {
  const parsed = z.string().uuid({ error: "IDが不正です" }).safeParse(id);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  let restoreResult:
    | Awaited<ReturnType<typeof restoreReservationCommand>>
    | undefined;

  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: id,
    execute: async () => {
      restoreResult = await restoreReservationCommand(id);
      return null;
    },
    afterSuccess: () => {
      if (!restoreResult) return;
      invalidateReservationCaches(id, restoreResult.customerId, {
        coupons: restoreResult.couponId !== null,
      });
    },
  });
};

export async function updateCustomerFromReservation(
  reservationId: string,
): Promise<MutationResult<{ customerId: string }>> {
  const parsed = z.string().uuid().safeParse(reservationId);
  if (!parsed.success) return createMutationError("無効な予約IDです");

  return executeAdminMutationResult({
    resource: "customer",
    action: "update",
    execute: async () => {
      const reservation = await getReservationGuestData(parsed.data);
      if (!reservation)
        throw new DomainError("予約が見つかりません", "NOT_FOUND");
      if (!reservation.guestLastName)
        throw new DomainError("ゲスト情報がありません", "VALIDATION");

      await updateCustomerFromGuestData(reservation.customerId, {
        lastName: reservation.guestLastName,
        firstName: reservation.guestFirstName ?? "",
        phoneNumber: reservation.guestPhone,
        companyName: reservation.guestCompanyName,
      });
      return { customerId: reservation.customerId };
    },
    afterSuccess: (data) => {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(data.customerId));
      updateTag(CACHE_TAGS.RESERVATIONS);
      updateTag(getCacheTag.reservations.calendar());
    },
  });
}
