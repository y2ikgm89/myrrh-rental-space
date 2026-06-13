"use server";

import type { SubmissionResult } from "@conform-to/react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { publicReservationSchema } from "@/shared/lib/validations/public-reservation";
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
import { createPublicReservationCommand } from "@/shared/domain/reservations/public-commands";
import {
  sendReservationAdminNotification,
  sendReservationConfirmationEmail,
} from "@/shared/lib/email/reservation-emails";
import { syncReservationToCalendar } from "@/shared/lib/calendar-sync/outbound";
import { fireAndForget } from "@/shared/lib/async-utils";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { recordTermsAgreementsCommand } from "@/shared/domain/terms/commands";
import { TERMS_AGREEMENT_CONTEXT } from "@/shared/lib/validations/terms";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { DomainError } from "@/shared/domain/domain-error";
import { verifySpaceBelongsToLocation } from "@/shared/domain/spaces/public-queries";
import { getCurrentCustomerUser } from "@/shared/lib/customer-auth";
import { createCompleteToken } from "@/shared/lib/reservation-complete-token";

const COMPLETE_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

export async function submitReservation(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  let completeToken: string | null = null;
  let succeeded = false;

  const submissionResult = await executeConformMutation(
    formData,
    publicReservationSchema,
    async (data) => {
      const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
      if (!rateLimit.success) {
        return { ok: false, error: rateLimit.error };
      }

      const turnstile = await validateTurnstile({
        token: data.turnstileToken,
        expectedAction: TURNSTILE_ACTIONS.reservation,
      });
      if (!turnstile.success) {
        return { ok: false, error: turnstile.error };
      }

      const belongsToLocation = await verifySpaceBelongsToLocation(
        data.spaceId,
        data.locationId,
      );
      if (!belongsToLocation) {
        return {
          ok: false,
          error: "選択されたスペースは指定された場所に属していません",
        };
      }

      const user = await getCurrentCustomerUser();

      const clientIp = await getClientIpFromHeaders();
      const headersList = await headers();
      const userAgent = headersList.get("user-agent");

      try {
        const result = await createPublicReservationCommand({
          ...data,
          userId: user?.id,
        });

        if (data.agreedTermsIds.length > 0) {
          fireAndForget(
            recordTermsAgreementsCommand({
              termsIds: data.agreedTermsIds,
              context: TERMS_AGREEMENT_CONTEXT.RESERVATION,
              resourceId: result.id,
              customerId: result.customerId ?? null,
              guestEmail: user ? null : data.email,
              ipAddress: clientIp,
              userAgent: userAgent ?? null,
            }),
            {
              operation: "recordTermsAgreements",
              category: ErrorCategory.DATABASE,
            },
          );
        }

        invalidateReservationCaches(result.id, result.customerId ?? null, {
          coupons: true,
          notifications: true,
        });

        const payload = omitUndefined(result.payload);
        fireAndForget(sendReservationAdminNotification(payload, "new"), {
          operation: "sendReservationAdminNotification",
          category: ErrorCategory.EXTERNAL_API,
        });

        fireAndForget(sendReservationConfirmationEmail(payload), {
          operation: "sendReservationConfirmationEmail",
          category: ErrorCategory.EXTERNAL_API,
        });

        // 公開予約は作成時点で CONFIRMED のため、ここで Google Calendar に同期する。
        // 連携が無効・未接続なら syncReservationToCalendar 内で no-op になる。
        fireAndForget(syncReservationToCalendar(payload), {
          operation: "syncReservationToCalendar",
          category: ErrorCategory.EXTERNAL_API,
        });

        fireAndForget(
          createNotificationCommand({
            type: NOTIFICATION_TYPE.RESERVATION_NEW,
            title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_NEW],
            message: `${result.payload.customerName}様が${result.payload.spaceName}を予約しました`,
            resourceType: "reservation",
            resourceId: result.id,
          }),
          {
            operation: "createReservationNotification",
            category: ErrorCategory.DATABASE,
          },
        );

        // 完了ページ用トークン（任意）。失敗しても予約成立は損なわず、トークン無しの
        // 汎用完了表示にフォールバックする。
        try {
          completeToken = createCompleteToken(
            result.id,
            new Date(Date.now() + COMPLETE_TOKEN_TTL_MS),
          );
        } catch (tokenError) {
          logError(normalizeError(tokenError), {
            category: ErrorCategory.UNKNOWN,
            severity: ErrorSeverity.LOW,
            context: {
              operation: "createReservationCompleteToken",
              reservationId: result.id,
            },
          });
        }

        succeeded = true;
        return { ok: true };
      } catch (error) {
        if (error instanceof DomainError) {
          return { ok: false, error: error.message };
        }
        throw error;
      }
    },
  );

  // 成功時は PRG で完了ページへ遷移（GET 副作用なし・リロード安全）。
  if (succeeded) {
    redirect(
      completeToken
        ? `/reservation/complete?token=${completeToken}`
        : "/reservation/complete",
    );
  }

  return submissionResult;
}
