"use server";

import { cookies, headers } from "next/headers";
import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { verifyStatusToken } from "@/shared/lib/reservation-status-token";
import { tokenFingerprint } from "@/shared/lib/tokens/fingerprint";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { updateGuestReservationByToken } from "@/shared/domain/reservations/customer-commands";
import {
  applyReservationEditSideEffects,
  getReservationSnapshotForGuestEdit,
} from "@/shared/domain/reservations/edit-side-effects";
import { getReservationForGuestEdit } from "@/shared/domain/reservations/customer-queries";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { fetchReservationEmailData } from "@/shared/domain/reservations/payloads";
import {
  syncReservationToCalendar,
  updateCalendarSync,
} from "@/shared/lib/calendar-sync/outbound";
import type { ReservationSyncData } from "@/shared/lib/calendar-sync/types";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";
import {
  sendReservationAdminNotification,
  sendReservationUpdatedEmail,
} from "@/shared/lib/email/reservation-emails";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { customerReservationEditSchema } from "@/shared/lib/validations/customer-reservation";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import {
  checkActionRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  formSubmitRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { DomainError } from "@/shared/domain/domain-error";
import { fireAndForget } from "@/shared/lib/async-utils";
import { omitUndefined } from "@/shared/lib/serialize";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { RESERVATION_STATUS_TOKEN_COOKIE_NAME } from "@/shared/lib/constants";
import { getPublicMaintenanceBlockMutation } from "@/shared/lib/maintenance-guard";

const reservationIdSchema = z.uuid({ error: "予約IDが不正です" });

export async function updateGuestReservationAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    customerReservationEditSchema,
    async (data) => {
      const maintenanceBlock = await getPublicMaintenanceBlockMutation();
      if (maintenanceBlock) {
        return { ok: false, error: maintenanceBlock.error };
      }

      const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
      if (!rateLimit.success) {
        return { ok: false, error: "リクエストが多すぎます" };
      }

      const turnstile = await validateTurnstile({
        token: data.turnstileToken,
        expectedAction: TURNSTILE_ACTIONS.guest_reservation_edit,
      });
      if (!turnstile.success) {
        return { ok: false, error: turnstile.error };
      }

      const cookieStore = await cookies();
      const statusToken =
        cookieStore.get(RESERVATION_STATUS_TOKEN_COOKIE_NAME)?.value ?? null;
      if (!statusToken) {
        return {
          ok: false,
          error: "リンクが無効または期限切れです",
        };
      }

      const verified = verifyStatusToken(statusToken, reservationDeadlineNow());
      if (!verified.valid) {
        logError(new Error("Guest edit status token verify failed"), {
          category: ErrorCategory.AUTHORIZATION,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "updateGuestReservationAction",
            ip: await getClientIpFromHeaders(),
            tokenFingerprint: tokenFingerprint(statusToken),
          },
        });
        return {
          ok: false,
          error: "リンクが無効または期限切れです",
        };
      }

      const parsedId = reservationIdSchema.safeParse(verified.reservationId);
      if (!parsedId.success) {
        return { ok: false, error: "予約IDが不正です" };
      }

      if (parsedId.data !== data.reservationId) {
        logError(new Error("Guest edit reservation id mismatch (stale tab)"), {
          category: ErrorCategory.AUTHORIZATION,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "updateGuestReservationAction",
            ip: await getClientIpFromHeaders(),
          },
        });
        return {
          ok: false,
          error:
            "表示中のページが最新ではありません。ページを再読み込みしてから再度お試しください",
        };
      }

      const session = await getCustomerSession();
      const sessionUserId = session?.user.id ?? null;
      if (sessionUserId) {
        const reservation = await getReservationForGuestEdit(parsedId.data);
        if (!reservation) {
          return { ok: false, error: "予約が見つかりません" };
        }
        const customer = await getCustomerByUserId(sessionUserId);
        if (customer && customer.id !== reservation.customerId) {
          return {
            ok: false,
            error:
              "このリンクは別のお客様のご予約です。マイページからご自身のご予約をご確認ください",
          };
        }
        if (customer) {
          try {
            await assertCustomerActive(customer.id);
          } catch (error) {
            if (error instanceof DomainError) {
              return { ok: false, error: error.message };
            }
            throw error;
          }
        }
      }

      if (!(await isFeatureEnabled("reservation"))) {
        return { ok: false, error: "この機能は現在利用できません。" };
      }

      try {
        const before = await getReservationSnapshotForGuestEdit(
          data.reservationId,
        );

        const settings = await getReservationDeadlineSettings();
        const result = await updateGuestReservationByToken(
          data.reservationId,
          data,
          settings.modificationDeadlineHours,
        );

        if (!result.success) {
          return { ok: false, error: result.error };
        }

        invalidateReservationCaches(data.reservationId, null, {
          coupons: true,
        });

        fireAndForget(
          (async () => {
            const payload = await fetchReservationEmailData(data.reservationId);
            if (!payload) return;
            const syncData: ReservationSyncData = omitUndefined(payload);
            if (result.payload.googleCalendarEventId) {
              await updateCalendarSync(
                syncData,
                result.payload.googleCalendarEventId,
              );
            } else {
              await syncReservationToCalendar(syncData);
            }
          })(),
          {
            operation: "guestUpdateReservationCalendarSync",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
            context: { reservationId: data.reservationId },
          },
        );

        fireAndForget(
          (async () => {
            let smartLockIssuanceFailed = false;
            if (before) {
              const newStartTime = parseDateTimeLocalAsJst(
                `${data.date}T${data.startTime}`,
              );
              const newEndTime = parseDateTimeLocalAsJst(
                `${data.date}T${data.endTime}`,
              );
              const sideEffectResult = await applyReservationEditSideEffects({
                reservationId: data.reservationId,
                oldSpaceId: before.spaceId,
                oldStartTime: before.startTime,
                oldEndTime: before.endTime,
                newSpaceId: data.spaceId,
                newStartTime,
                newEndTime,
              });
              smartLockIssuanceFailed = sideEffectResult.issuanceFailed;
            }

            const payload = await fetchReservationEmailData(data.reservationId);
            if (!payload) return;
            const payloadData = omitUndefined({
              ...payload,
              ...(smartLockIssuanceFailed
                ? { smartLockIssuanceFailed: true }
                : {}),
            });
            await Promise.all([
              sendReservationUpdatedEmail(payloadData),
              sendReservationAdminNotification(payloadData, "update"),
            ]);
          })(),
          {
            operation: "sendGuestReservationUpdateNotification",
            category: ErrorCategory.EXTERNAL_API,
            severity: ErrorSeverity.LOW,
            context: { reservationId: data.reservationId },
          },
        );

        fireAndForget(
          createNotificationCommand({
            type: NOTIFICATION_TYPE.RESERVATION_UPDATE,
            title:
              NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_UPDATE],
            message: "ゲスト予約が変更されました",
            resourceType: "reservation",
            resourceId: data.reservationId,
          }),
          {
            operation: "createGuestUpdateNotification",
            category: ErrorCategory.DATABASE,
          },
        );

        const auditNewValue = {
          spaceId: data.spaceId,
          startTime: parseDateTimeLocalAsJst(
            `${data.date}T${data.startTime}`,
          ).toISOString(),
          endTime: parseDateTimeLocalAsJst(
            `${data.date}T${data.endTime}`,
          ).toISOString(),
        };
        const auditOldValue = before
          ? {
              spaceId: before.spaceId,
              startTime: before.startTime.toISOString(),
              endTime: before.endTime.toISOString(),
            }
          : null;
        const requestHeaders = await headers();
        const ip = await getClientIpFromHeaders();
        const userAgent = requestHeaders.get("user-agent");
        fireAndForget(
          createAuditLogRecord({
            ...(sessionUserId ? { userId: sessionUserId } : {}),
            action: AuditAction.UPDATE,
            resource: "reservation",
            resourceId: data.reservationId,
            ...(auditOldValue ? { oldValue: auditOldValue } : {}),
            newValue: auditNewValue,
            metadata: {
              channel: "customer-token",
              ip,
              userAgent,
              tokenFingerprint: tokenFingerprint(statusToken),
            },
          }).catch((error: unknown) => {
            logError(normalizeError(error), {
              category: ErrorCategory.DATABASE,
              severity: ErrorSeverity.HIGH,
              context: {
                operation: "auditLogGuestReservationUpdate",
                reservationId: data.reservationId,
              },
            });
          }),
          {
            operation: "auditLogGuestReservationUpdate",
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.HIGH,
            context: { reservationId: data.reservationId },
          },
        );

        return { ok: true };
      } catch (error) {
        if (error instanceof DomainError) {
          return { ok: false, error: error.message };
        }
        throw error;
      }
    },
  );
}
