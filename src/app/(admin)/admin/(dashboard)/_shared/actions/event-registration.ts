"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  createEventRegistrationCommand,
  cancelEventRegistrationCommand,
} from "@/shared/domain/events/registration-commands";
import {
  sendEventRegistrationConfirmation,
  sendEventRegistrationCancelled,
  sendEventAdminNotification,
} from "@/shared/lib/email/event-emails";
import { getEventDetailsForEmail } from "@/shared/domain/events/registration-queries";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { NOTIFICATION_TYPE } from "@/shared/lib/validations/enums/helpers";
import {
  adminEventRegistrationSchema,
  type AdminEventRegistrationInput,
} from "@/shared/lib/validations/event-registration";
import type { MutationResult } from "@/shared/lib/mutation-result";

const idSchema = z.string().uuid({ error: "IDが不正です" });

type CreateRegistrationResult = {
  id: string;
  registration: {
    id: string;
    eventId: string;
    name: string;
    email: string;
    numberOfPeople: number;
  };
  event: { title: string };
};

export async function adminCreateRegistration(
  input: AdminEventRegistrationInput,
): Promise<MutationResult<CreateRegistrationResult>> {
  const parsed = adminEventRegistrationSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "create",
    execute: async () => {
      const result = await createEventRegistrationCommand({
        eventId: parsed.data.eventId,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone ?? null,
        note: parsed.data.note ?? null,
        numberOfPeople: parsed.data.numberOfPeople,
      });
      return {
        id: result.registration.id,
        registration: result.registration,
        event: result.event,
      };
    },
    afterSuccess: (data) => {
      updateTag(CACHE_TAGS.EVENTS);
      updateTag(getCacheTag.events.detail(data.registration.eventId));
      updateTag(getCacheTag.eventRegistrations.list(data.registration.eventId));

      fireAndForget(
        (async () => {
          const event = await getEventDetailsForEmail(
            data.registration.eventId,
          );
          if (!event) return;

          await Promise.all([
            sendEventRegistrationConfirmation({
              registrationId: data.registration.id,
              customerName: data.registration.name,
              customerEmail: data.registration.email,
              eventTitle: data.event.title,
              eventStartTime: event.startTime,
              eventEndTime: event.endTime,
              location: event.location ?? undefined,
              numberOfPeople: data.registration.numberOfPeople,
            }),
            sendEventAdminNotification(
              {
                registrationId: data.registration.id,
                participantName: data.registration.name,
                participantEmail: data.registration.email,
                eventTitle: data.event.title,
                eventStartTime: event.startTime,
                numberOfPeople: data.registration.numberOfPeople,
                currentRegistrations: event._count.registrations,
                capacity: event.capacity,
              },
              "registration",
            ),
          ]);
        })(),
        {
          operation: "sendAdminEventRegistrationEmails",
          category: ErrorCategory.EXTERNAL_API,
        },
      );
    },
    resolveAuditResourceId: (data) => data.id,
  });
}

type CancelRegistrationData = {
  registrationId: string;
  eventId: string;
  name: string;
  email: string;
  eventTitle: string;
  numberOfPeople: number;
};

export async function adminCancelRegistration(
  registrationId: string,
): Promise<MutationResult<CancelRegistrationData>> {
  const validated = idSchema.safeParse(registrationId);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      const registration = await cancelEventRegistrationCommand(validated.data);

      return {
        registrationId: registration.id,
        eventId: registration.eventId,
        name: registration.name,
        email: registration.email,
        eventTitle: registration.event.title,
        numberOfPeople: registration.numberOfPeople,
      };
    },
    afterSuccess: (data) => {
      updateTag(CACHE_TAGS.EVENTS);
      updateTag(getCacheTag.events.detail(data.eventId));
      updateTag(getCacheTag.eventRegistrations.list(data.eventId));

      fireAndForget(
        createNotificationCommand({
          type: NOTIFICATION_TYPE.EVENT_REGISTRATION,
          title: "イベント申込キャンセル（管理者）",
          message: `${data.name}様の「${data.eventTitle}」申込を管理者がキャンセルしました`,
          resourceType: "event",
          resourceId: data.eventId,
        }),
        {
          operation: "createAdminEventCancellationNotification",
          category: ErrorCategory.DATABASE,
        },
      );
      updateTag(CACHE_TAGS.NOTIFICATIONS);

      fireAndForget(
        (async () => {
          const event = await getEventDetailsForEmail(data.eventId);
          if (!event) return;

          await Promise.all([
            sendEventRegistrationCancelled({
              registrationId: data.registrationId,
              customerName: data.name,
              customerEmail: data.email,
              eventTitle: data.eventTitle,
              eventStartTime: event.startTime,
            }),
            sendEventAdminNotification(
              {
                registrationId: data.registrationId,
                participantName: data.name,
                participantEmail: data.email,
                eventTitle: data.eventTitle,
                eventStartTime: event.startTime,
                numberOfPeople: data.numberOfPeople,
                currentRegistrations: event._count.registrations,
                capacity: event.capacity,
              },
              "cancellation",
            ),
          ]);
        })(),
        {
          operation: "sendAdminEventCancellationEmails",
          category: ErrorCategory.EXTERNAL_API,
        },
      );
    },
  });
}
