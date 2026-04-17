"use server";

import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  createAdminReservationCommand,
  updateAdminReservationCommand,
} from "@/shared/domain/reservations/admin-commands";
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
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";

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

      const payloadData = omitUndefined(result.payload);
      const calendarData: ReservationSyncData = payloadData;
      if (validation.data.sendEmail) {
        fireAndForget(
          Promise.all([
            sendReservationConfirmationEmail(payloadData),
            sendReservationAdminNotification(payloadData, "new"),
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

      fireAndForget(
        createNotificationCommand({
          type: NOTIFICATION_TYPE.RESERVATION_NEW,
          title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_NEW],
          message: "管理者が新規予約を作成しました",
          resourceType: "reservation",
          resourceId: result.id,
        }),
        {
          operation: "createAdminReservationNotification",
          category: ErrorCategory.DATABASE,
        },
      );

      invalidateReservationCaches(result.id, result.customerId, {
        coupons: true,
        notifications: true,
      });
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

      const payloadData = omitUndefined(result.payload);
      const calendarData: ReservationSyncData = payloadData;
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
        fireAndForget(sendReservationConfirmationEmail(payloadData), {
          operation: "sendNotificationEmail",
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.LOW,
          context: { reservationId: id },
        });
      }

      fireAndForget(
        createNotificationCommand({
          type: NOTIFICATION_TYPE.RESERVATION_UPDATE,
          title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_UPDATE],
          message: "管理者が予約を更新しました",
          resourceType: "reservation",
          resourceId: id,
        }),
        {
          operation: "updateAdminReservationNotification",
          category: ErrorCategory.DATABASE,
        },
      );

      invalidateReservationCaches(id, result.customerId, {
        coupons: true,
        notifications: true,
      });
    },
  });
};
