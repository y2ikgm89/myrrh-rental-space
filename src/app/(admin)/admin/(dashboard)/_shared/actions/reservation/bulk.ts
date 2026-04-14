"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import { ReservationStatus } from "@generated/prisma/enums";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { getReservationStatus } from "@/shared/domain/reservations/admin-queries";
import { updateReservationStatusCommand } from "@/shared/domain/reservations/lifecycle-commands";
import type { ReservationSyncData } from "@/shared/lib/calendar-sync/types";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  syncReservationToCalendar,
  updateCalendarSync,
  deleteCalendarSync,
} from "@/shared/lib/calendar-sync/outbound";
import {
  sendReservationAdminNotification,
  sendReservationCancelledEmail,
  sendReservationConfirmationEmail,
} from "@/shared/lib/email/reservation-emails";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";

// =============================================================================
// Types
// =============================================================================

type BulkResult = { succeeded: number; skipped: number; failed: number };

// =============================================================================
// Validation
// =============================================================================

const bulkIdsSchema = z
  .array(z.string().uuid({ error: "予約IDが不正です" }))
  .min(1, { error: "1件以上選択してください" });

// =============================================================================
// Helpers
// =============================================================================

function handleConfirmAfterSuccess(
  id: string,
  result: Awaited<ReturnType<typeof updateReservationStatusCommand>>,
) {
  const payloadData = omitUndefined(result.payload);
  const calendarData: ReservationSyncData = payloadData;

  if (result.googleCalendarEventId) {
    fireAndForget(
      updateCalendarSync(calendarData, result.googleCalendarEventId),
      {
        operation: "bulkConfirm:updateCalendarSync",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { reservationId: id },
      },
    );
  } else {
    fireAndForget(syncReservationToCalendar(calendarData), {
      operation: "bulkConfirm:syncReservationToCalendar",
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
        result.previousStatus === ReservationStatus.PENDING ? "new" : "update",
      ),
    ]),
    {
      operation: "bulkConfirm:sendConfirmationEmails",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { reservationId: id },
    },
  );
}

function handleCancelAfterSuccess(
  id: string,
  result: Awaited<ReturnType<typeof updateReservationStatusCommand>>,
) {
  const payloadData = omitUndefined(result.payload);

  if (result.googleCalendarEventId) {
    fireAndForget(deleteCalendarSync(id, result.googleCalendarEventId), {
      operation: "bulkCancel:deleteCalendarSync",
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
      operation: "bulkCancel:sendCancellationEmails",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: { reservationId: id },
    },
  );
}

// =============================================================================
// Bulk Confirm (PENDING → CONFIRMED)
// =============================================================================

export async function bulkConfirmReservations(
  ids: string[],
): Promise<MutationResult<BulkResult>> {
  const parsed = bulkIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    execute: async () => {
      let succeeded = 0;
      let skipped = 0;
      let failed = 0;

      for (const id of parsed.data) {
        try {
          const reservation = await getReservationStatus(id);

          if (
            !reservation ||
            reservation.status !== ReservationStatus.PENDING
          ) {
            skipped++;
            continue;
          }

          const result = await updateReservationStatusCommand(
            id,
            ReservationStatus.CONFIRMED,
          );

          handleConfirmAfterSuccess(id, result);
          succeeded++;
        } catch {
          failed++;
        }
      }

      return { succeeded, skipped, failed };
    },
    afterSuccess: (data) => {
      if (data.succeeded > 0) {
        updateTag(CACHE_TAGS.RESERVATIONS);
        updateTag(getCacheTag.reservations.calendar());
        for (const id of parsed.data) {
          updateTag(getCacheTag.reservations.detail(id));
        }
      }
    },
  });
}

// =============================================================================
// Bulk Cancel (PENDING | CONFIRMED → CANCELLED)
// =============================================================================

export async function bulkCancelReservations(
  ids: string[],
): Promise<MutationResult<BulkResult>> {
  const parsed = bulkIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    execute: async () => {
      let succeeded = 0;
      let skipped = 0;
      let failed = 0;

      for (const id of parsed.data) {
        try {
          const reservation = await getReservationStatus(id);

          if (
            !reservation ||
            !ACTIVE_RESERVATION_STATUSES.includes(reservation.status)
          ) {
            skipped++;
            continue;
          }

          const result = await updateReservationStatusCommand(
            id,
            ReservationStatus.CANCELLED,
          );

          handleCancelAfterSuccess(id, result);
          succeeded++;
        } catch {
          failed++;
        }
      }

      return { succeeded, skipped, failed };
    },
    afterSuccess: (data) => {
      if (data.succeeded > 0) {
        updateTag(CACHE_TAGS.RESERVATIONS);
        updateTag(getCacheTag.reservations.calendar());
        for (const id of parsed.data) {
          updateTag(getCacheTag.reservations.detail(id));
        }
      }
    },
  });
}
