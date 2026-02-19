"use server";

import { prisma } from "@/shared/lib/prisma";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import { fireAndForget } from "@/shared/lib/async-utils";
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { ReservationStatus } from "@/shared/generated/prisma/enums";
import { z } from "zod";
import {
  sendReservationConfirmationEmail,
  sendReservationCancelledEmail,
  sendReservationAdminNotification,
} from "@/shared/lib/email-service";
import { createSuccess, createFailure } from "@/admin/types/server-actions";
import { withPermission } from "@/admin/lib/server-action-helpers";
import {
  syncReservationToCalendar,
  updateCalendarSync,
  deleteCalendarSync,
  type ReservationSyncData,
} from "@/shared/lib/calendar-sync";

// =============================================================================
// Private Schemas
// =============================================================================

const updateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["PENDING", "CONFIRMED", "CANCELLED"]),
});

const updateNotesSchema = z.object({
  id: z.string().uuid(),
  notes: z.string().max(1000).nullable(),
});

// =============================================================================
// Mutations
// =============================================================================

/**
 * 予約ステータスを更新
 */
export const updateReservationStatus = withPermission<
  [string, ReservationStatus]
>(
  "reservation",
  "update",
)(async (_user, id, status) => {
  const parsed = updateStatusSchema.safeParse({ id, status });
  if (!parsed.success) {
    return createFailure("入力が不正です");
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    include: {
      space: { select: { name: true, address: true } },
      customer: { select: { firstName: true, lastName: true, email: true } },
    },
  });

  if (!reservation) {
    return createFailure("予約が見つかりません");
  }

  const previousStatus = reservation.status;

  await prisma.reservation.update({
    where: { id },
    data: { status },
  });

  // ステータス変更時にメール送信
  const emailData = {
    reservationId: id,
    customerEmail: reservation.customer.email,
    customerName: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
    spaceName: reservation.space.name,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    totalPrice: reservation.totalPrice,
    notes: reservation.notes || undefined,
  };

  // カレンダー同期用データ
  const calendarData: ReservationSyncData = {
    reservationId: id,
    spaceName: reservation.space.name,
    customerName: `${reservation.customer.lastName} ${reservation.customer.firstName}`,
    customerEmail: reservation.customer.email,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    location: reservation.space.address ?? undefined,
    notes: reservation.notes ?? undefined,
    totalPrice: reservation.totalPrice,
  };

  // 確定時: 確認メール送信 + カレンダー同期
  if (status === "CONFIRMED" && previousStatus !== "CONFIRMED") {
    // カレンダーイベント更新 or 新規作成（バックグラウンド）
    if (reservation.googleCalendarEventId) {
      // 既存イベントを更新
      fireAndForget(
        updateCalendarSync(calendarData, reservation.googleCalendarEventId),
        {
          operation: "updateCalendarSync",
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: { reservationId: id },
        },
      );
    } else {
      // イベントがない場合は新規作成（初回同期失敗時のフォールバック）
      fireAndForget(syncReservationToCalendar(calendarData), {
        operation: "syncReservationToCalendar",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { reservationId: id },
      });
    }
    // メール送信（バックグラウンド）
    fireAndForget(
      Promise.all([
        sendReservationConfirmationEmail(emailData),
        sendReservationAdminNotification(
          emailData,
          previousStatus === "PENDING" ? "new" : "update",
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

  // キャンセル時: キャンセルメール送信 + カレンダー削除
  if (status === "CANCELLED" && previousStatus !== "CANCELLED") {
    // カレンダーイベント削除（バックグラウンド）
    if (reservation.googleCalendarEventId) {
      fireAndForget(deleteCalendarSync(id, reservation.googleCalendarEventId), {
        operation: "deleteCalendarSync",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { reservationId: id },
      });
    }
    // メール送信（バックグラウンド）
    fireAndForget(
      Promise.all([
        sendReservationCancelledEmail(emailData),
        sendReservationAdminNotification(emailData, "cancel"),
      ]),
      {
        operation: "sendCancellationEmails",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: { reservationId: id },
      },
    );
  }

  updateTag(CACHE_TAGS.RESERVATIONS);
  updateTag(getCacheTag.reservations.detail(id));

  return createSuccess("ステータスを更新しました");
});

/**
 * 予約メモを更新
 */
export const updateReservationNotes = withPermission<[string, string | null]>(
  "reservation",
  "update",
)(async (_user, id, notes) => {
  const parsed = updateNotesSchema.safeParse({ id, notes });
  if (!parsed.success) {
    return createFailure("入力が不正です");
  }

  const reservation = await prisma.reservation.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!reservation) {
    return createFailure("予約が見つかりません");
  }

  await prisma.reservation.update({
    where: { id },
    data: { notes },
  });

  updateTag(CACHE_TAGS.RESERVATIONS);
  updateTag(getCacheTag.reservations.detail(id));

  return createSuccess("メモを更新しました");
});

/**
 * 予約を削除
 */
export const deleteReservation = withPermission<[string]>(
  "reservation",
  "delete",
)(async (_user, id) => {
  const reservation = await prisma.reservation.findUnique({
    where: { id },
    select: { id: true, googleCalendarEventId: true },
  });

  if (!reservation) {
    return createFailure("予約が見つかりません");
  }

  // カレンダーからイベントを削除（バックグラウンド、DB削除前に開始）
  if (reservation.googleCalendarEventId) {
    fireAndForget(deleteCalendarSync(id, reservation.googleCalendarEventId), {
      operation: "deleteCalendarSync",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: { reservationId: id, trigger: "deleteReservation" },
    });
  }

  await prisma.reservation.delete({
    where: { id },
  });

  updateTag(CACHE_TAGS.RESERVATIONS);

  return createSuccess("予約を削除しました");
});
