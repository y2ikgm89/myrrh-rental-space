"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { emitBulkAuditRecords } from "@/admin/lib/audit";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  AuditAction,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { getReservationStatus } from "@/shared/domain/reservations/admin-queries";
import { updateReservationStatusCommand } from "@/shared/domain/reservations/lifecycle-commands";
import { applyCancellationSideEffects } from "@/shared/domain/reservations/cancellation-side-effects";
import type { ReservationSyncData } from "@/shared/lib/calendar-sync/types";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  syncReservationToCalendar,
  updateCalendarSync,
} from "@/shared/lib/calendar-sync/outbound";
import {
  sendReservationAdminNotification,
  sendReservationConfirmationEmail,
} from "@/shared/lib/email/reservation-emails";
import { ACTIVE_RESERVATION_STATUSES } from "@/shared/lib/validations/enums/helpers";

// =============================================================================
// Types
// =============================================================================

type BulkResult = { succeeded: number; skipped: number; failed: number };

type BulkConfirmSucceededItem = {
  id: string;
  previousStatus: ReservationStatus;
};

type BulkConfirmOutcome = BulkResult & {
  actorUserId: string;
  ip: string | null;
  userAgent: string | null;
  succeededItems: BulkConfirmSucceededItem[];
};

type BulkCancelOutcome = BulkResult & {
  actorUserId: string;
  ip: string | null;
  userAgent: string | null;
  succeededIds: string[];
};

// =============================================================================
// Validation
// =============================================================================

const bulkIdsSchema = z
  .array(z.uuid({ error: "予約IDが不正です" }))
  .min(1, { error: "1件以上選択してください" });

const bulkCancellationReasonSchema = z
  .string()
  .max(500, { error: "理由は500文字以内で入力してください" })
  .optional()
  .or(z.literal(""));

// =============================================================================
// Confirm side effects (per-id, non-blocking)
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

function buildBulkAuditMetadata(args: {
  ip: string | null;
  userAgent: string | null;
}): Record<string, unknown> {
  return {
    channel: "admin",
    ...(args.ip !== null && { ip: args.ip }),
    ...(args.userAgent !== null && { userAgent: args.userAgent }),
  };
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
    execute: async (user): Promise<BulkConfirmOutcome> => {
      const { ip, userAgent } = await buildAuditRequestContext();
      let succeeded = 0;
      let skipped = 0;
      let failed = 0;
      const succeededItems: BulkConfirmSucceededItem[] = [];

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
          succeededItems.push({
            id,
            previousStatus: result.previousStatus,
          });
          succeeded++;
        } catch (error) {
          logError(normalizeError(error), {
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
            context: {
              operation: "bulkConfirmReservations",
              reservationId: id,
            },
          });
          failed++;
        }
      }

      return {
        succeeded,
        skipped,
        failed,
        succeededItems,
        actorUserId: user.id,
        ip,
        userAgent,
      };
    },
    afterSuccess: (outcome) => {
      if (outcome.succeeded > 0) {
        updateTag(CACHE_TAGS.RESERVATIONS);
        updateTag(getCacheTag.reservations.calendar());
        for (const id of parsed.data) {
          updateTag(getCacheTag.reservations.detail(id));
        }
      }

      if (outcome.succeededItems.length > 0) {
        emitBulkAuditRecords({
          resource: "reservation",
          userId: outcome.actorUserId,
          records: outcome.succeededItems.map((item) => ({
            resourceId: item.id,
            action: AuditAction.UPDATE,
            oldValue: { status: item.previousStatus },
            newValue: { status: ReservationStatus.CONFIRMED },
          })),
          metadata: buildBulkAuditMetadata({
            ip: outcome.ip,
            userAgent: outcome.userAgent,
          }),
        });
      }
    },
  });
}

// =============================================================================
// Bulk Cancel (PENDING | CONFIRMED → CANCELLED)
// =============================================================================

/**
 * bulk cancel は per-reservation で `applyCancellationSideEffects` を呼ぶ。
 * これにより single-cancel 経路と同じ副作用チェーン (Stripe refund /
 * SwitchBot passcode revoke / customer + admin メール / in-app 通知 /
 * per-reservation AuditLog) が per-id で発火する。集約 metadata (channel /
 * ip / userAgent / sideEffects outcomes) も SSoT 経由で書かれるため、
 * forensic 追跡が single-cancel と完全に対称になる。
 *
 * `suppress` は指定しない — admin が任意選択した bulk cancel では、
 * 個別メール・個別 GCal delete こそが正しい挙動 (series 一括キャンセルの
 * 集約経路は `applyBulkCancellationSideEffects` を使う)。
 */
export async function bulkCancelReservations(
  ids: string[],
  reason?: string,
): Promise<MutationResult<BulkResult>> {
  const parsed = bulkIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);
  const parsedReason = bulkCancellationReasonSchema.safeParse(reason);
  if (!parsedReason.success) {
    return createValidationMutationError(parsedReason.error);
  }
  const cancellationReason =
    parsedReason.data && parsedReason.data !== "" ? parsedReason.data : null;

  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    execute: async (user): Promise<BulkCancelOutcome> => {
      const { ip, userAgent } = await buildAuditRequestContext();
      const request = { ip, userAgent };
      let succeeded = 0;
      let skipped = 0;
      let failed = 0;
      const succeededIds: string[] = [];

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

          await updateReservationStatusCommand(id, ReservationStatus.CANCELLED);

          // SSoT: single-cancel 経路と同じ副作用チェーン + per-id AuditLog を発火。
          await applyCancellationSideEffects({
            reservationId: id,
            cancellationReason,
            channel: "admin",
            actorUserId: user.id,
            request,
          });

          succeededIds.push(id);
          succeeded++;
        } catch (error) {
          logError(normalizeError(error), {
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
            context: {
              operation: "bulkCancelReservations",
              reservationId: id,
            },
          });
          failed++;
        }
      }

      return {
        succeeded,
        skipped,
        failed,
        succeededIds,
        actorUserId: user.id,
        ip,
        userAgent,
      };
    },
    afterSuccess: (outcome) => {
      if (outcome.succeeded > 0) {
        updateTag(CACHE_TAGS.RESERVATIONS);
        updateTag(getCacheTag.reservations.calendar());
        for (const id of parsed.data) {
          updateTag(getCacheTag.reservations.detail(id));
        }
      }
    },
  });
}
