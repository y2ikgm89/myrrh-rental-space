"use server";

import { cookies } from "next/headers";
import type { SubmissionResult } from "@conform-to/react";
import { z } from "zod";
import { verifyEventRegistrationStatusToken } from "@/shared/lib/event-registration-status-token";
import { tokenFingerprint } from "@/shared/lib/tokens/fingerprint";
import { validateTurnstile } from "@/shared/domain/settings/turnstile";
import { eventDeadlineNow } from "@/shared/domain/events/server-deadline-instant";
import { updateGuestEventRegistrationByToken } from "@/shared/domain/events/registration-commands";
import { applyEventRegistrationSelfServeUpdateSideEffects } from "@/shared/domain/events/registration-update-side-effects";
import { getEventRegistrationForGuestEdit } from "@/shared/domain/events/registration-queries";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertGuestTokenCustomerGates } from "@/shared/domain/customers/guest-token-gates";
import { eventRegistrationEditSchema } from "@/shared/lib/validations/event-registration";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import {
  editByEventRegistrationRateLimiter,
  formSubmitRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { DomainError } from "@/shared/domain/domain-error";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import { EVENT_REGISTRATION_STATUS_TOKEN_COOKIE_NAME } from "@/shared/lib/constants";
import { getPublicMaintenanceBlockMutation } from "@/shared/domain/settings/maintenance-guard";
import { GUEST_STATUS_EVENT_REGISTRATION_MEMBER_OWNERSHIP_MISMATCH_MESSAGE } from "@/shared/lib/guest-status-member-ownership";

const registrationIdSchema = z.string().min(1, { error: "申込IDが不正です" });

export async function updateGuestEventRegistrationAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    eventRegistrationEditSchema,
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
        expectedAction: TURNSTILE_ACTIONS.guest_event_registration_edit,
      });
      if (!turnstile.success) {
        return { ok: false, error: turnstile.error };
      }

      const cookieStore = await cookies();
      const statusToken =
        cookieStore.get(EVENT_REGISTRATION_STATUS_TOKEN_COOKIE_NAME)?.value ??
        null;
      if (!statusToken) {
        return {
          ok: false,
          error: "リンクが無効または期限切れです",
        };
      }

      const verified = verifyEventRegistrationStatusToken(
        statusToken,
        eventDeadlineNow(),
      );
      if (!verified.valid) {
        logError(new Error("Guest event edit status token verify failed"), {
          category: ErrorCategory.AUTHORIZATION,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "updateGuestEventRegistrationAction",
            ip: await getClientIpFromHeaders(),
            tokenFingerprint: tokenFingerprint(statusToken),
          },
        });
        return {
          ok: false,
          error: "リンクが無効または期限切れです",
        };
      }

      const parsedId = registrationIdSchema.safeParse(verified.registrationId);
      if (!parsedId.success) {
        return { ok: false, error: "申込IDが不正です" };
      }

      if (parsedId.data !== data.registrationId) {
        logError(new Error("Guest event edit registration id mismatch"), {
          category: ErrorCategory.AUTHORIZATION,
          severity: ErrorSeverity.LOW,
          context: {
            operation: "updateGuestEventRegistrationAction",
            ip: await getClientIpFromHeaders(),
          },
        });
        return {
          ok: false,
          error:
            "表示中のページが最新ではありません。ページを再読み込みしてから再度お試しください",
        };
      }

      const perRegistration = await editByEventRegistrationRateLimiter.check(
        parsedId.data,
      );
      if (!perRegistration.success) {
        return {
          ok: false,
          error:
            "この申込に対する変更試行が多すぎます。しばらく時間をおいてからお試しください",
        };
      }

      const registration = await getEventRegistrationForGuestEdit(
        parsedId.data,
      );
      if (!registration) {
        return { ok: false, error: "申込が見つかりません" };
      }

      const session = await getCustomerSession();
      const sessionUserId = session?.user.id ?? null;
      let sessionCustomerId: string | null = null;
      if (sessionUserId) {
        const customer = await getCustomerByUserId(sessionUserId);
        if (
          customer &&
          registration.customerId !== null &&
          customer.id !== registration.customerId
        ) {
          return {
            ok: false,
            error:
              GUEST_STATUS_EVENT_REGISTRATION_MEMBER_OWNERSHIP_MISMATCH_MESSAGE,
          };
        }
        sessionCustomerId = customer?.id ?? null;
      }

      try {
        await assertGuestTokenCustomerGates({
          resourceCustomerId: registration.customerId,
          sessionCustomerId,
        });
      } catch (error) {
        if (error instanceof DomainError) {
          return { ok: false, error: error.message };
        }
        throw error;
      }

      if (!(await isFeatureEnabled("events"))) {
        return { ok: false, error: "この機能は現在利用できません。" };
      }

      try {
        const result = await updateGuestEventRegistrationByToken(
          data.registrationId,
          {
            name: data.name,
            email: data.email,
            phone: data.phone ?? null,
            note: data.note ?? null,
            quantity: data.quantity,
          },
        );

        if (!result.success) {
          return { ok: false, error: result.error };
        }

        invalidateEventCaches();

        await applyEventRegistrationSelfServeUpdateSideEffects({
          registrationId: data.registrationId,
          eventId: registration.eventId,
          customerId: registration.customerId,
          channel: "customer-token",
          actorUserId: sessionUserId,
          tokenFingerprint: tokenFingerprint(statusToken),
          payload: result.payload,
          emailContext: {
            eventTitle: registration.event.title,
            eventStartTime: registration.slot.startAt,
            eventEndTime: registration.slot.endAt,
            ticketName: registration.ticket.name,
            ticketUnitPrice: registration.ticket.price,
          },
          newValues: {
            name: data.name,
            email: data.email,
            phone: data.phone ?? null,
            note: data.note ?? null,
            quantity: data.quantity,
          },
        });

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
