"use server";

import type { SubmissionResult } from "@conform-to/react";
import { updateTag } from "next/cache";
import { publicEventRegistrationSchema } from "@/shared/lib/validations/event-registration";
import { z } from "zod";
import {
  checkActionRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
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
import {
  sendEventRegistrationConfirmation,
  sendEventRegistrationCancelled,
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
import { getEventDetailsForEmail } from "@/shared/domain/events/registration-queries";

export async function registerForEvent(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    publicEventRegistrationSchema,
    async (data) => {
      const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
      if (!rateLimit.success) {
        return { ok: false, error: rateLimit.error };
      }

      const turnstile = await validateTurnstile({
        token: data.turnstileToken,
        expectedAction: TURNSTILE_ACTIONS.event_registration,
      });
      if (!turnstile.success) {
        return { ok: false, error: turnstile.error };
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

      try {
        const result = await createEventRegistrationCommand({
          eventId: data.eventId,
          ticketId: data.ticketId,
          name: data.name,
          email: data.email,
          phone: data.phone ?? null,
          note: data.note ?? null,
          quantity: data.quantity,
          customerId,
        });

        invalidateEventCaches();

        fireAndForget(
          (async () => {
            const event = await getEventDetailsForEmail(
              result.registration.eventId,
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
            resourceId: result.registration.eventId,
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
): Promise<MutationResult<null>> {
  // 1. Rate limit check
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  // 2. UUID validation
  const idValidation = z
    .uuid({ error: "申込IDが不正です" })
    .safeParse(registrationId);
  if (!idValidation.success) return createMutationError("申込IDが不正です");

  // 3. Require authenticated session
  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  // 4. Require customer
  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  // 5. Cancel registration
  try {
    const registration = await cancelEventRegistrationCommand(
      registrationId,
      customer.id,
    );

    // 5. Invalidate cache
    invalidateEventCaches();

    // 顧客統計が変わる場合は CUSTOMERS も無効化
    updateTag(CACHE_TAGS.CUSTOMERS);
    updateTag(getCacheTag.customers.detail(customer.id));

    // 6. Create admin notification (fire-and-forget)
    fireAndForget(
      createNotificationCommand({
        type: NOTIFICATION_TYPE.EVENT_REGISTRATION,
        title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.EVENT_REGISTRATION],
        message: `${registration.name}様が「${registration.event.title}」の申込をキャンセルしました`,
        resourceType: "event",
        resourceId: registration.eventId,
      }),
      {
        operation: "createEventCancellationNotification",
        category: ErrorCategory.DATABASE,
      },
    );

    // 7. Send cancellation email (fire-and-forget)
    fireAndForget(
      (async () => {
        const event = await getEventDetailsForEmail(registration.eventId);
        if (!event) return;

        await Promise.all([
          sendEventRegistrationCancelled({
            registrationId: registration.id,
            customerName: registration.name,
            customerEmail: registration.email,
            eventTitle: registration.event.title,
            eventStartTime: event.startTime,
            eventEndTime: event.endTime,
            location: event.location ?? undefined,
            quantity: registration.quantity,
            icsSequence: registration.icsSequence,
          }),
          sendEventAdminNotification(
            {
              registrationId: registration.id,
              eventId: registration.eventId,
              participantName: registration.name,
              participantEmail: registration.email,
              eventTitle: registration.event.title,
              eventStartTime: event.startTime,
              quantity: registration.quantity,
              currentRegistrations: event.confirmedCount,
              capacity: event.capacity,
            },
            "cancellation",
          ),
        ]);
      })(),
      {
        operation: "sendEventCancellationEmails",
        category: ErrorCategory.EXTERNAL_API,
      },
    );

    return null;
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
