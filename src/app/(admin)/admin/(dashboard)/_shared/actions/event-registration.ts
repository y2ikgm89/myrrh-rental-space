"use server";

import { headers } from "next/headers";
import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  adminCancelEventRegistrationCommand,
  createWalkInRegistrationCommand,
  setEventRegistrationCheckInCommand,
} from "@/shared/domain/events/registration-commands";
import { applyEventRegistrationCancellationSideEffects } from "@/shared/domain/events/registration-cancellation-side-effects";
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
import { getClientIpFromHeaders } from "@/shared/lib/rate-limit";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  prismaCuid2IdSchema,
  prismaCuidIdSchema,
} from "@/shared/lib/validations/params";

const eventRegistrationIdSchema = prismaCuidIdSchema("イベント参加申込");
const eventIdSchema = prismaCuidIdSchema("イベント");
const eventTicketIdSchema = prismaCuidIdSchema("イベントチケット");
const eventTimeSlotIdSchema = prismaCuid2IdSchema("イベントタイムスロット");

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
  const validated = eventRegistrationIdSchema.safeParse(registrationId);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      const registration = await adminCancelEventRegistrationCommand(
        validated.data,
      );

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

      // メール / 通知 / 監査ログを一括で副作用ヘルパーへ委譲
      // （会員・ゲスト経路と SSoT 共有。reservations の admin 経路と同型）。
      fireAndForget(
        (async () => {
          const requestHeaders = await headers();
          const ip = await getClientIpFromHeaders();
          const userAgent = requestHeaders.get("user-agent");
          await applyEventRegistrationCancellationSideEffects({
            registrationId: data.registrationId,
            channel: "admin",
            actorUserId: null,
            request: { ip, userAgent },
          });
        })(),
        {
          operation: "applyEventRegistrationCancellationSideEffects",
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
  registrationId: eventRegistrationIdSchema,
  eventId: eventIdSchema,
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
        eventId: parsed.data.eventId,
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
  eventId: eventIdSchema,
  slotId: eventTimeSlotIdSchema,
  ticketId: eventTicketIdSchema,
  name: z.string().trim().min(1, "氏名を入力してください").max(100),
  // 受付係が代行入力するため任意。空文字は null 扱い
  email: z
    .string()
    .trim()
    .max(255)
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v))
    .pipe(
      z.union([z.email({ error: "メールアドレスの形式が不正です" }), z.null()]),
    ),
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
