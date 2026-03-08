"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { createSuccess } from "@/admin/types/server-actions";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { createValidationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import { ReservationStatus } from "@/shared/db/enums";
import {
  deleteReservationCommand,
  updateReservationNotesCommand,
  updateReservationStatusCommand,
} from "@/shared/domain/reservations/commands";
import {
  syncReservationToCalendar,
  updateCalendarSync,
  deleteCalendarSync,
  type ReservationSyncData,
} from "@/shared/lib/calendar-sync";
import {
  sendReservationAdminNotification,
  sendReservationCancelledEmail,
  sendReservationConfirmationEmail,
} from "@/shared/lib/email-service";

const updateStatusSchema = z.object({
  id: z.string().uuid({ error: "IDが不正です" }),
  status: z.enum(ReservationStatus),
});

const updateNotesSchema = z.object({
  id: z.string().uuid({ error: "IDが不正です" }),
  notes: z.string().max(1000).nullable(),
});

export const updateReservationStatus = async (
  id: string,
  status: ReservationStatus,
) => {
  const parsed = updateStatusSchema.safeParse({ id, status });
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  let result:
    | Awaited<ReturnType<typeof updateReservationStatusCommand>>
    | undefined;

  return executeAdminMutation({
    resource: "reservation",
    action: "update",
    resourceId: id,
    execute: async () => {
      result = await updateReservationStatusCommand(id, status);
    },
    success: () => createSuccess("ステータスを更新しました"),
    afterSuccess: () => {
      if (!result) {
        return;
      }

      const notification = result.notification;
      const calendarData: ReservationSyncData = { ...notification };

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
            sendReservationConfirmationEmail(notification),
            sendReservationAdminNotification(
              notification,
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
            sendReservationCancelledEmail(notification),
            sendReservationAdminNotification(notification, "cancel"),
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
    },
  });
};

export const updateReservationNotes = async (
  id: string,
  notes: string | null,
) => {
  const parsed = updateNotesSchema.safeParse({ id, notes });
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "reservation",
    action: "update",
    resourceId: id,
    execute: async () => {
      await updateReservationNotesCommand(id, notes);
    },
    success: () => createSuccess("メモを更新しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.RESERVATIONS);
      updateTag(getCacheTag.reservations.detail(id));
    },
  });
};

export const deleteReservation = async (id: string) => {
  let googleCalendarEventId: string | null = null;

  return executeAdminMutation({
    resource: "reservation",
    action: "delete",
    resourceId: id,
    execute: async () => {
      const result = await deleteReservationCommand(id);
      googleCalendarEventId = result.googleCalendarEventId;
    },
    success: () => createSuccess("予約を削除しました"),
    afterSuccess: () => {
      if (googleCalendarEventId) {
        fireAndForget(deleteCalendarSync(id, googleCalendarEventId), {
          operation: "deleteCalendarSync",
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: { reservationId: id, trigger: "deleteReservation" },
        });
      }

      updateTag(CACHE_TAGS.RESERVATIONS);
    },
  });
};
