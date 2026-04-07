"use server";

import { updateTag } from "next/cache";
import {
  publicEventRegistrationSchema,
  type PublicEventRegistrationInput,
} from "@/shared/lib/validations/event-registration";
import { z } from "zod";
import {
  checkActionRateLimit,
  createValidationMutationError,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
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
import { DomainError } from "@/shared/domain/domain-error";
import { getSession } from "@/shared/lib/auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { getEventDetailsForEmail } from "@/shared/domain/events/registration-queries";

export async function registerForEvent(
  input: PublicEventRegistrationInput,
): Promise<MutationResult<{ id: string }>> {
  // 1. Rate limit check
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  // 2. Validate input
  const parsed = publicEventRegistrationSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  // 3. Turnstile verification
  const turnstile = await validateTurnstile(parsed.data.turnstileToken);
  if (!turnstile.success) {
    return createMutationError(turnstile.error);
  }

  // 4. Get current user (non-blocking — null if not logged in)
  const session = await getSession();
  const user = session?.user;
  let customerId: string | null = null;
  if (user) {
    const customer = await getCustomerByUserId(user.id);
    if (customer) {
      customerId = customer.id;
    }
  }

  // 5. Create registration
  try {
    const { turnstileToken: _, ...registrationData } = parsed.data;
    const result = await createEventRegistrationCommand({
      eventId: registrationData.eventId,
      name: registrationData.name,
      email: registrationData.email,
      phone: registrationData.phone ?? null,
      note: registrationData.note ?? null,
      numberOfPeople: registrationData.numberOfPeople,
      customerId,
    });

    // 6. Invalidate cache
    updateTag(CACHE_TAGS.EVENTS);
    updateTag(getCacheTag.events.detail(result.registration.eventId));
    updateTag(getCacheTag.eventRegistrations.list(result.registration.eventId));

    // 7. Send emails (fire-and-forget)
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
            numberOfPeople: result.registration.numberOfPeople,
          }),
          sendEventAdminNotification(
            {
              participantName: result.registration.name,
              participantEmail: result.registration.email,
              eventTitle: result.event.title,
              eventStartTime: event.startTime,
              numberOfPeople: result.registration.numberOfPeople,
              currentRegistrations: event._count.registrations,
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

    return { id: result.registration.id };
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}

export async function cancelEventRegistration(
  registrationId: string,
): Promise<MutationResult<null>> {
  // 1. Rate limit check
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  // 1.5 UUID validation
  const idValidation = z
    .string()
    .uuid({ error: "申込IDが不正です" })
    .safeParse(registrationId);
  if (!idValidation.success) return createMutationError("申込IDが不正です");

  // 2. Require authenticated session
  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  // 3. Require customer
  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  // 4. Cancel registration
  try {
    const registration = await cancelEventRegistrationCommand(
      registrationId,
      customer.id,
    );

    // 5. Invalidate cache
    updateTag(CACHE_TAGS.EVENTS);
    updateTag(getCacheTag.events.detail(registration.eventId));
    updateTag(getCacheTag.eventRegistrations.list(registration.eventId));

    // 顧客統計が変わる場合は CUSTOMERS も無効化
    if (customer) {
      updateTag(CACHE_TAGS.CUSTOMERS);
      updateTag(getCacheTag.customers.detail(customer.id));
    }

    // 6. Send cancellation email (fire-and-forget)
    fireAndForget(
      (async () => {
        const event = await getEventDetailsForEmail(registration.eventId);
        if (!event) return;

        await Promise.all([
          sendEventRegistrationCancelled({
            customerName: registration.name,
            customerEmail: registration.email,
            eventTitle: registration.event.title,
            eventStartTime: event.startTime,
          }),
          sendEventAdminNotification(
            {
              participantName: registration.name,
              participantEmail: registration.email,
              eventTitle: registration.event.title,
              eventStartTime: event.startTime,
              numberOfPeople: registration.numberOfPeople,
              currentRegistrations: event._count.registrations,
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
