"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  createAdminReservationCommand,
  updateAdminReservationCommand,
} from "@/shared/domain/reservations/commands";
import {
  syncReservationToCalendar,
  updateCalendarSync,
} from "@/shared/lib/calendar-sync/outbound";
import type { ReservationSyncData } from "@/shared/lib/calendar-sync/types";
import {
  sendReservationAdminNotification,
  sendReservationConfirmationEmail,
} from "@/shared/lib/email/reservation-emails";
import {
  adminReservationSchema,
  type AdminReservationInput,
  updateReservationSchema,
  type UpdateReservationInput,
} from "@/admin/lib/validations/admin-reservation";

export const createAdminReservation = async (
  input: AdminReservationInput,
): Promise<MutationResult<{ id: string }>> => {
  const validation = adminReservationSchema.safeParse(input);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  let result:
    | Awaited<ReturnType<typeof createAdminReservationCommand>>
    | undefined;

  return executeAdminMutationResult({
    resource: "reservation",
    action: "create",
    execute: async () => {
      const { customerData, ...restData } = validation.data;
      result = await createAdminReservationCommand(
        omitUndefined({
          ...restData,
          ...(customerData && {
            customerData: omitUndefined(customerData),
          }),
        }),
      );
      return { id: result.id };
    },
    afterSuccess: () => {
      if (!result) {
        return;
      }

      const calendarData: ReservationSyncData = omitUndefined(result.calendar);
      const notificationData = omitUndefined(result.notification);
      if (validation.data.sendEmail) {
        fireAndForget(
          Promise.all([
            sendReservationConfirmationEmail(notificationData),
            sendReservationAdminNotification(notificationData, "new"),
            syncReservationToCalendar(calendarData),
          ]),
          {
            operation: "createAdminReservationPostTasks",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.MEDIUM,
            context: { reservationId: result.id },
          },
        );
      } else {
        fireAndForget(syncReservationToCalendar(calendarData), {
          operation: "syncReservationToCalendar",
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: {
            reservationId: result.id,
            trigger: "createAdminReservation",
          },
        });
      }

      updateTag(CACHE_TAGS.RESERVATIONS);
      updateTag(getCacheTag.reservations.calendar());
    },
    resolveAuditResourceId: (payload) => payload.id,
  });
};

export const updateAdminReservation = async (
  id: string,
  input: UpdateReservationInput,
): Promise<MutationResult> => {
  const validation = updateReservationSchema.safeParse(input);
  if (!validation.success) {
    return createValidationMutationError(validation.error);
  }

  let result:
    | Awaited<ReturnType<typeof updateAdminReservationCommand>>
    | undefined;

  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: id,
    execute: async () => {
      result = await updateAdminReservationCommand(
        id,
        omitUndefined(validation.data),
      );
      return null;
    },
    afterSuccess: () => {
      if (!result) {
        return;
      }

      const calendarData: ReservationSyncData = omitUndefined(
        result.notification,
      );
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
          context: { reservationId: id, trigger: "updateAdminReservation" },
        });
      }

      if (validation.data.sendNotificationEmail) {
        fireAndForget(
          sendReservationConfirmationEmail(omitUndefined(result.notification)),
          {
            operation: "sendNotificationEmail",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
            context: { reservationId: id },
          },
        );
      }

      updateTag(CACHE_TAGS.RESERVATIONS);
      updateTag(getCacheTag.reservations.detail(id));
      updateTag(getCacheTag.reservations.calendar());
    },
  });
};
