"use server";

import type { SubmissionResult } from "@conform-to/react";
import { updateTag } from "next/cache";
import { publicEventRegistrationSchema } from "@/shared/lib/validations/event-registration";
import {
  checkActionRateLimit,
  checkBotHeuristics,
  checkEmailRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  eventRegistrationByEmailRateLimiter,
  eventRegistrationSubmitRateLimiter,
  formSubmitRateLimiter,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  createEventRegistrationCommand,
  cancelEventRegistrationCommand,
} from "@/shared/domain/events/registration-commands";
import { applyEventRegistrationCancellationSideEffects } from "@/shared/domain/events/registration-cancellation-side-effects";
import {
  sendEventRegistrationConfirmation,
  sendEventAdminNotification,
} from "@/shared/lib/email/event-emails";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { DomainError } from "@/shared/domain/domain-error";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getEventRegistrationDetailsForEmail } from "@/shared/domain/events/registration-queries";
import { recordTermsAgreementsCommand } from "@/shared/domain/terms/commands";
import { assertAllRequiredTermsAgreed } from "@/shared/lib/terms-consent-gate";
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";
import { headers } from "next/headers";
import { getClientIpFromHeaders } from "@/shared/lib/rate-limit";
import { prismaCuidIdSchema } from "@/shared/lib/validations/params";

const registrationIdSchema = prismaCuidIdSchema("イベント参加申込");

export async function registerForEvent(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    publicEventRegistrationSchema,
    async (data) => {
      const rateLimit = await checkActionRateLimit(
        eventRegistrationSubmitRateLimiter,
      );
      if (!rateLimit.success) {
        return { ok: false, error: rateLimit.error };
      }

      const emailRateLimit = await checkEmailRateLimit(
        eventRegistrationByEmailRateLimiter,
        data.email,
      );
      if (!emailRateLimit.success) {
        return { ok: false, error: emailRateLimit.error };
      }

      const botCheck = checkBotHeuristics({
        honeypot: data.website,
        formRenderedAt: data.formRenderedAt,
      });
      if (!botCheck.success) {
        return { ok: false, error: botCheck.error };
      }

      const turnstile = await validateTurnstile({
        token: data.turnstileToken,
        expectedAction: TURNSTILE_ACTIONS.event_registration,
      });
      if (!turnstile.success) {
        return { ok: false, error: turnstile.error };
      }

      // Server-side consent gate (EVENT_REGISTRATION scope の必須規約強制)
      try {
        await assertAllRequiredTermsAgreed({
          scope: TermsScope.EVENT_REGISTRATION,
          agreedTermsIds: data.agreedTermsIds,
        });
      } catch (error) {
        return {
          ok: false,
          error:
            error instanceof Error ? error.message : "規約への同意が必要です",
        };
      }

      // Get current user (non-blocking — null if not logged in)
      const session = await getCustomerSession();
      const user = session?.user;
      let customerId: string | null = null;
      if (user) {
        const customer = await getCustomerByUserId(user.id);
        if (customer) {
          customerId = customer.id;
        }
      }

      const clientIp = await getClientIpFromHeaders();
      const headersList = await headers();
      const userAgent = headersList.get("user-agent");

      try {
        const result = await createEventRegistrationCommand({
          eventId: data.eventId,
          slotId: data.slotId,
          ticketId: data.ticketId,
          name: data.name,
          email: data.email,
          phone: data.phone ?? null,
          note: data.note ?? null,
          quantity: data.quantity,
          customerId,
        });

        if (data.agreedTermsIds.length > 0) {
          // 法務 evidence は await で確実に記録する。
          await recordTermsAgreementsCommand({
            termsIds: data.agreedTermsIds,
            scope: TermsScope.EVENT_REGISTRATION,
            resourceId: result.registration.id,
            customerId,
            guestEmail: customerId ? null : data.email,
            ipAddress: clientIp,
            userAgent: userAgent ?? null,
          });
        }

        invalidateEventCaches();

        fireAndForget(
          (async () => {
            const event = await getEventRegistrationDetailsForEmail(
              result.registration.id,
            );
            if (!event) return;

            await Promise.all([
              sendEventRegistrationConfirmation({
                registrationId: result.registration.id,
                customerName: result.registration.name,
                customerEmail: result.registration.email,
                eventTitle: result.event.title,
                eventStartTime: event.startTime,
                eventEndTime: event.endTime,
                location: event.location ?? undefined,
                quantity: result.registration.quantity,
                icsSequence: result.registration.icsSequence,
                customerId,
              }),
              sendEventAdminNotification(
                {
                  registrationId: result.registration.id,
                  eventId: result.registration.eventId,
                  participantName: result.registration.name,
                  participantEmail: result.registration.email,
                  eventTitle: result.event.title,
                  eventStartTime: event.startTime,
                  quantity: result.registration.quantity,
                  currentRegistrations: event.confirmedCount,
                  capacity: event.capacity,
                },
                "registration",
              ),
            ]);
          })(),
          {
            operation: "sendEventRegistrationEmails",
            category: ErrorCategory.EXTERNAL_API,
          },
        );

        fireAndForget(
          createNotificationCommand({
            type: NOTIFICATION_TYPE.EVENT_REGISTRATION,
            title:
              NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.EVENT_REGISTRATION],
            message: `${result.registration.name}様が「${result.event.title}」に申し込みました`,
            resourceType: "event",
          }),
          {
            operation: "createEventRegistrationNotification",
            category: ErrorCategory.DATABASE,
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

export async function cancelEventRegistration(
  registrationId: string,
  turnstileToken?: string,
): Promise<MutationResult<null>> {
  // 1. Rate limit check
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  // 2. Turnstile 検証（予約のマイページキャンセルと同じく、認証済みでも bot 対策として要求）
  const turnstile = await validateTurnstile({
    token: turnstileToken,
    expectedAction: TURNSTILE_ACTIONS.mypage_event_registration_cancel,
  });
  if (!turnstile.success) return createMutationError(turnstile.error);

  // 3. cuid validation（EventRegistration.id は cuid、UUID ではない）
  const idValidation = registrationIdSchema.safeParse(registrationId);
  if (!idValidation.success) return createMutationError("申込IDが不正です");

  // 4. Require authenticated session
  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  // 5. Require customer
  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  // 6. Cancel registration（atomic claim + 統一副作用実行）
  try {
    const registration = await cancelEventRegistrationCommand(
      registrationId,
      customer.id,
    );

    invalidateEventCaches();

    // 顧客統計が変わる場合は CUSTOMERS も無効化
    updateTag(CACHE_TAGS.CUSTOMERS);
    updateTag(getCacheTag.customers.detail(customer.id));

    // 副作用統一実行: メール / 通知 / 監査ログ
    const requestHeaders = await headers();
    const ip = await getClientIpFromHeaders();
    const userAgent = requestHeaders.get("user-agent");

    await applyEventRegistrationCancellationSideEffects({
      registrationId: registration.id,
      channel: "customer-mypage",
      actorUserId: session.user.id,
      request: { ip, userAgent },
    });

    return null;
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
