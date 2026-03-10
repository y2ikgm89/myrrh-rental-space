"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import { ReservationStatus } from "@/shared/db/enums";
import type { MutationResult } from "@/shared/lib/mutation-result"
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
    },
  });
};

export const deleteReservation = async (id: string): Promise<MutationResult> => {
  let googleCalendarEventId: string | null = null;

  return executeAdminMutationResult({
    resource: "reservation",
    action: "delete",
    resourceId: id,
    execute: async () => {
      const result = await deleteReservationCommand(id);
      googleCalendarEventId = result.googleCalendarEventId;
      return null;
    },
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
