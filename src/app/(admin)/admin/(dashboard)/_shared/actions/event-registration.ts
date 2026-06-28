"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  cancelEventRegistrationCommand,
  createWalkInRegistrationCommand,
  setEventRegistrationCheckInCommand,
} from "@/shared/domain/events/registration-commands";
import {
  sendEventRegistrationCancelled,
  sendEventAdminNotification,
} from "@/shared/lib/email/event-emails";
import { getEventRegistrationDetailsForEmail } from "@/shared/domain/events/registration-queries";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("イベント参加申込");
// EventRegistration.id / Event.id / EventTicket.id は cuid (varchar 30) なので uuid 不可
const cuidSchema = z
  .string()
  .min(1, { error: "IDが不正です" })
  .max(30, { error: "IDが不正です" });

type CancelRegistrationData = {
  registrationId: string;
  eventId: string;
  name: string;
  // walk-in 由来は null
  email: string | null;
  eventTitle: string;
  quantity: number;
  icsSequence: number;
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
        quantity: registration.quantity,
        icsSequence: registration.icsSequence,
      };
    },
    afterSuccess: (data) => {
      updateTag(CACHE_TAGS.EVENTS);

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

      fireAndForget(
        (async () => {
          const event = await getEventRegistrationDetailsForEmail(
            data.registrationId,
          );
          if (!event) return;

          await Promise.all([
            sendEventRegistrationCancelled({
              registrationId: data.registrationId,
              customerName: data.name,
              customerEmail: data.email,
              eventTitle: data.eventTitle,
              eventStartTime: event.startTime,
              eventEndTime: event.endTime,
              location: event.location ?? undefined,
              quantity: data.quantity,
              icsSequence: data.icsSequence,
            }),
            sendEventAdminNotification(
              {
                registrationId: data.registrationId,
                eventId: data.eventId,
                participantName: data.name,
                participantEmail: data.email,
                eventTitle: data.eventTitle,
                eventStartTime: event.startTime,
                quantity: data.quantity,
                currentRegistrations: event.confirmedCount,
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

// =============================================================================
// 当日受付 (check-in) — 出席フラグ toggle
// =============================================================================

const checkInToggleSchema = z.object({
  registrationId: cuidSchema,
  eventId: cuidSchema,
  attended: z.boolean(),
});

export type CheckInToggleInput = z.infer<typeof checkInToggleSchema>;

export async function toggleEventRegistrationCheckIn(
  input: CheckInToggleInput,
): Promise<
  MutationResult<{
    registrationId: string;
    attendedAt: Date | null;
    changed: boolean;
  }>
> {
  const parsed = checkInToggleSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: parsed.data.eventId,
    execute: async () => {
      // DomainError は executeAdminMutationResult が外側で MutationError に変換する
      const result = await setEventRegistrationCheckInCommand({
        registrationId: parsed.data.registrationId,
        attended: parsed.data.attended,
      });
      return {
        registrationId: result.registrationId,
        attendedAt: result.after,
        changed: result.changed,
      };
    },
    // check-in toggle は公開側 (EVENTS) には影響しないため cache 無効化不要
  });
}

// =============================================================================
// 当日参加 (walk-in) — 受付確定と同時に出席打刻
// =============================================================================

const walkInSchema = z.object({
  eventId: cuidSchema,
  slotId: cuidSchema,
  ticketId: cuidSchema,
  name: z.string().trim().min(1, "氏名を入力してください").max(100),
  // 受付係が代行入力するため任意。空文字は null 扱い
  email: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v))
    .pipe(z.union([z.email("メールアドレスの形式が不正です"), z.null()])),
  phone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
  note: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
  quantity: z.number().int().min(1).max(100),
});

export type WalkInRegistrationInput = z.input<typeof walkInSchema>;

export async function createWalkInRegistration(
  input: WalkInRegistrationInput,
): Promise<
  MutationResult<{ registrationId: string; eventId: string; name: string }>
> {
  const parsed = walkInSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: parsed.data.eventId,
    execute: async () => {
      // DomainError は executeAdminMutationResult が外側で MutationError に変換する
      const result = await createWalkInRegistrationCommand({
        eventId: parsed.data.eventId,
        slotId: parsed.data.slotId,
        ticketId: parsed.data.ticketId,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        note: parsed.data.note,
        quantity: parsed.data.quantity,
      });
      return {
        registrationId: result.registration.id,
        eventId: result.registration.eventId,
        name: result.registration.name,
      };
    },
    afterSuccess: (data) => {
      // walk-in は新規行作成 → 公開側の定員残数表示にも影響するため EVENTS を無効化
      invalidateEventCaches();

      fireAndForget(
        createNotificationCommand({
          type: NOTIFICATION_TYPE.EVENT_REGISTRATION,
          title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.EVENT_REGISTRATION],
          message: `${data.name}様が当日参加で受付されました`,
          resourceType: "event",
          resourceId: data.eventId,
        }),
        {
          operation: "createWalkInRegistrationNotification",
          category: ErrorCategory.DATABASE,
        },
      );
    },
  });
}
