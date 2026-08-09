"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { assertAdminFeatureCreateAllowed } from "@/shared/domain/features/check";
import {
  adminCancelEventRegistrationCommand,
  createAdminProxyRegistrationCommand,
  createWalkInRegistrationCommand,
  setEventRegistrationCheckInCommand,
  updateEventRegistrationCommand,
} from "@/shared/domain/events/registration-commands";
import {
  sendEventAdminNotification,
  sendEventRegistrationConfirmation,
} from "@/shared/domain/email/lib-dispatch";
import {
  getEventEmailRenderContext,
  resolveEventAdminNotificationDelivery,
} from "@/shared/domain/settings/queries/email-render-context";
import { getEventRegistrationDetailsForEmail } from "@/shared/domain/events/registration-queries";
import {
  recordManualEventPaymentCommand,
  refundEventRegistrationPaymentCommand,
  createEventCheckoutSessionCommand,
  type RefundEventRegistrationResult,
} from "@/shared/domain/events/payment-commands";
import type { WaitlistPromotionOutcome } from "@/shared/domain/events/registration-cancel-core";
import { applyEventRegistrationCancellationSideEffects } from "@/shared/domain/events/registration-cancellation-side-effects";
import { fireAndForget } from "@/shared/lib/async-utils";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { REFUNDED_BY_TYPE } from "@/shared/lib/validations/enums/refund-attribution";
import { getClientIpFromHeaders } from "@/shared/lib/rate-limit";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { entityIdSchema } from "@/shared/lib/validations/entity-id";
import type { SubmissionResult } from "@conform-to/react";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import {
  adminProxyRegistrationSchema,
  walkInRegistrationSchema,
} from "@/shared/lib/validations/event-registration-onsite";

import {
  updateRegistrationSchema,
  type UpdateRegistrationInput,
} from "@/admin/lib/validations/event-registration-update";

const eventRegistrationIdSchema = entityIdSchema("EventRegistration");
const eventIdSchema = entityIdSchema("Event");

type CancelRegistrationData = {
  registrationId: string;
  eventId: string;
  name: string;
  // walk-in 由来は null
  email: string | null;
  eventTitle: string;
  quantity: number;
  icsSequence: number;
  /** FIFO で繰り上げ当選した申込（無ければ null）。afterSuccess の繰り上げ当選メール送信要否判定に使う。 */
  promoted: WaitlistPromotionOutcome;
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
        promoted: registration.promoted,
      };
    },
    afterSuccess: (data) => {
      // CACHE-INVALIDATE-04: 公開イベントページ (Cache-Tag `event-v1`) が edge に
      // 残り続けないよう helper 経由で Cloudflare CDN purge も併発する。
      invalidateEventCaches();

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
            promoted: data.promoted,
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
// 管理者による返金 (task #9 PR#5 task B: event admin refund UI)
// =============================================================================

/**
 * 管理者による event registration 返金 (Reservation 側 `refundReservationPayment` の対称)。
 *
 * actorType=ADMIN で `refundEventRegistrationPaymentCommand` を呼び出す。amount 未指定 →
 * `Refund` 集計後の残額全額を返金 (PAID 申込なら paidAmount、PARTIALLY_REFUNDED 申込なら
 * paidAmount - Σ既 refunds)。actorUserId は Better Auth session の管理者 id。
 *
 * @param registrationId 対象 event registration ID
 * @param options 部分返金 amount / 返金理由。両方省略で残額全額返金 + reason なし
 */
export async function refundEventRegistrationPayment(
  registrationId: string,
  options?: {
    /** 部分返金額 (円、正整数)。省略で残額全額。 */
    amount?: number;
    /** 返金理由 (Refund.reason + AuditLog metadata に記録)。 */
    reason?: string;
  },
): Promise<MutationResult<RefundEventRegistrationResult>> {
  const validated = eventRegistrationIdSchema.safeParse(registrationId);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: validated.data,
    execute: async (user) => {
      // UA-HORIZ-04: admin session hijack シナリオでの forensics 対称化のため
      // ip / userAgent を AuditLog metadata に載せる (cancel / receipt / waitlist と同型)。
      const request = await buildAuditRequestContext();
      return refundEventRegistrationPaymentCommand({
        registrationId: validated.data,
        actorType: REFUNDED_BY_TYPE.ADMIN,
        actorUserId: user.id,
        request,
        ...(options?.amount !== undefined ? { amount: options.amount } : {}),
        ...(options?.reason !== undefined && options.reason !== ""
          ? { reason: options.reason }
          : {}),
      });
    },
    afterSuccess: () => {
      // 公開側は refund で残枠が変わらないため EVENTS collection のみ無効化
      // (reservation 側と同型)
      invalidateEventCaches();
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
// 参加登録編集 (update)
// =============================================================================

export async function updateEventRegistration(
  input: UpdateRegistrationInput,
): Promise<MutationResult<{ registrationId: string }>> {
  const parsed = updateRegistrationSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: parsed.data.registrationId,
    execute: async (user) => {
      const { previous } = await updateEventRegistrationCommand({
        registrationId: parsed.data.registrationId,
        name: parsed.data.name,
        email: parsed.data.email,
        phone: parsed.data.phone,
        note: parsed.data.note,
        quantity: parsed.data.quantity,
      });
      const { ip, userAgent } = await buildAuditRequestContext();
      return {
        registrationId: parsed.data.registrationId,
        previous,
        actorUserId: user.id,
        ip,
        userAgent,
      };
    },
    afterSuccess: (outcome) => {
      invalidateEventCaches();

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "event-registration",
          resourceId: parsed.data.registrationId,
          oldValue: outcome.previous,
          newValue: {
            name: parsed.data.name,
            email: parsed.data.email,
            phone: parsed.data.phone,
            note: parsed.data.note,
            quantity: parsed.data.quantity,
          },
          metadata: {
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogUpdateEventRegistration",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
    },
    resolveAuditResourceId: (outcome) => outcome.registrationId,
  });
}

// =============================================================================
// 当日参加 (walk-in) — 受付確定と同時に出席打刻
// =============================================================================

export async function createWalkInRegistration(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    walkInRegistrationSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "event",
        action: "update",
        resourceId: data.eventId,
        execute: async () => {
          await assertAdminFeatureCreateAllowed("events");
          const result = await createWalkInRegistrationCommand({
            eventId: data.eventId,
            slotId: data.slotId,
            ticketId: data.ticketId,
            name: data.name,
            // schema は検証だけを担うので、空欄→null の正規化はここで行う
            email: data.email || null,
            phone: data.phone || null,
            note: data.note || null,
            quantity: data.quantity,
          });
          return {
            registrationId: result.registration.id,
            eventId: result.registration.eventId,
            name: result.registration.name,
          };
        },
        afterSuccess: (created) => {
          // walk-in は新規行作成 → 公開側の定員残数表示にも影響するため EVENTS を無効化
          invalidateEventCaches();

          fireAndForget(
            createNotificationCommand({
              type: NOTIFICATION_TYPE.EVENT_REGISTRATION,
              title:
                NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.EVENT_REGISTRATION],
              message: `${created.name}様が当日参加で受付されました`,
              resourceType: "event",
              resourceId: created.eventId,
            }),
            {
              operation: "createWalkInRegistrationNotification",
              category: ErrorCategory.DATABASE,
            },
          );
        },
      });

      if (isMutationError(result)) return { ok: false, error: result.error };
      return { ok: true };
    },
  );
}

// =============================================================================
// 事前代行登録 (admin proxy) — 電話・口頭申込を admin が代理登録し、確認メールも送る
// =============================================================================

export async function createAdminProxyRegistration(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    adminProxyRegistrationSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "event",
        action: "update",
        resourceId: data.eventId,
        execute: async () => {
          await assertAdminFeatureCreateAllowed("events");
          const result = await createAdminProxyRegistrationCommand({
            eventId: data.eventId,
            slotId: data.slotId,
            ticketId: data.ticketId,
            name: data.name,
            // 代行登録では email は Zod で必須検証済み。空欄→null の正規化が要るのは
            // 任意項目だけ（schema は検証に徹し、正規化はこの保存経路の責務）。
            email: data.email,
            phone: data.phone || null,
            note: data.note || null,
            quantity: data.quantity,
          });
          // email は Zod で必須検証済 (string 保証)。DB 返り値の
          // `EventRegistration.email` は `string | null` 型なので、渡した値を再利用
          // することで narrowing する（data.email 由来なので同一値）。
          return {
            registrationId: result.registration.id,
            eventId: result.registration.eventId,
            name: result.registration.name,
            email: data.email,
            quantity: result.registration.quantity,
            icsSequence: result.registration.icsSequence,
          };
        },
        afterSuccess: (created) => {
          // admin proxy は新規行作成 → 公開側の定員残数表示にも影響するため EVENTS を無効化
          invalidateEventCaches();

          // 確認メール（参加者宛 + admin 通知）を fire-and-forget で送信。
          // 公開申込 path (registerForEvent) と同じ getEventRegistrationDetailsForEmail
          // 経由でスロット時刻・定員・残数を解決してから送る。
          fireAndForget(
            (async () => {
              const details = await getEventRegistrationDetailsForEmail(
                created.registrationId,
              );
              if (!details) return;

              const [renderContext, adminDelivery] = await Promise.all([
                getEventEmailRenderContext(),
                resolveEventAdminNotificationDelivery("registration"),
              ]);

              const sends = [
                sendEventRegistrationConfirmation(
                  {
                    registrationId: created.registrationId,
                    customerName: created.name,
                    customerEmail: created.email,
                    eventTitle: details.eventTitle,
                    eventStartTime: details.startTime,
                    eventEndTime: details.endTime,
                    location: details.location ?? undefined,
                    quantity: created.quantity,
                    icsSequence: created.icsSequence,
                    customerId: null,
                    format: details.format,
                    meetingUrl: details.meetingUrl,
                  },
                  renderContext,
                ),
              ];
              if (adminDelivery.enabled) {
                sends.push(
                  sendEventAdminNotification(
                    {
                      registrationId: created.registrationId,
                      eventId: created.eventId,
                      participantName: created.name,
                      participantEmail: created.email,
                      eventTitle: details.eventTitle,
                      eventStartTime: details.startTime,
                      quantity: created.quantity,
                      currentRegistrations: details.confirmedCount,
                      capacity: details.capacity,
                    },
                    "registration",
                    adminDelivery,
                  ),
                );
              }
              await Promise.all(sends);
            })(),
            {
              operation: "sendAdminProxyRegistrationEmails",
              category: ErrorCategory.EXTERNAL_API,
            },
          );

          fireAndForget(
            createNotificationCommand({
              type: NOTIFICATION_TYPE.EVENT_REGISTRATION,
              title:
                NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.EVENT_REGISTRATION],
              message: `${created.name}様の申込を代行登録しました`,
              resourceType: "event",
              resourceId: created.eventId,
            }),
            {
              operation: "createAdminProxyRegistrationNotification",
              category: ErrorCategory.DATABASE,
            },
          );
        },
      });

      if (isMutationError(result)) return { ok: false, error: result.error };
      return { ok: true };
    },
  );
}

// =============================================================================
// 一括キャンセル・一括チェックイン
// =============================================================================

const bulkRegistrationIdsSchema = z
  .array(eventRegistrationIdSchema)
  .min(1, { error: "1件以上選択してください" });

type BulkResult = { succeeded: number; skipped: number; failed: number };

/**
 * reservation/bulk.ts の bulkCancelReservations と同型: per-id で
 * adminCancelEventRegistrationCommand を呼んだ直後に、単発キャンセル
 * (adminCancelRegistration) と同じ applyEventRegistrationCancellationSideEffects
 * （Stripe refund / waitlist 繰り上げ / 顧客・管理者メール / 監査ログ）を明示的に
 * 呼び出す。これを省くと bulk cancel だけ返金・繰り上げ当選・監査ログが一切残らない
 * 非対称になるため、副作用は per-id ループ内で必ず発火させる。失敗した id は
 * skip して残りを継続する。
 */
export async function bulkCancelEventRegistrations(
  ids: string[],
): Promise<MutationResult<BulkResult>> {
  const parsed = bulkRegistrationIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    execute: async (user): Promise<BulkResult> => {
      const requestHeaders = await headers();
      const ip = await getClientIpFromHeaders();
      const userAgent = requestHeaders.get("user-agent");
      let succeeded = 0;
      let failed = 0;

      for (const id of parsed.data) {
        try {
          const registration = await adminCancelEventRegistrationCommand(id);
          // reservation/bulk.ts の bulkCancelReservations と同型: per-id で
          // 単発キャンセルと同じ副作用チェーン（Stripe refund / waitlist促進 /
          // 顧客・管理者メール / 監査ログ）を発火する。ここを省くと bulk cancel
          // だけ返金・繰り上げ当選・監査ログが一切残らない非対称になる。
          await applyEventRegistrationCancellationSideEffects({
            registrationId: id,
            channel: "admin",
            actorUserId: user.id,
            request: { ip, userAgent },
            promoted: registration.promoted,
          });
          succeeded++;
        } catch (error) {
          logError(normalizeError(error), {
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
            context: {
              operation: "bulkCancelEventRegistrations",
              registrationId: id,
            },
          });
          failed++;
        }
      }

      return { succeeded, skipped: 0, failed };
    },
    afterSuccess: () => {
      invalidateEventCaches();
    },
  });
}

/**
 * setEventRegistrationCheckInCommand を per-id で呼び、まとめて出席済みに変える。
 *
 * `setEventRegistrationCheckInCommand` は `{eventId, registrationId, attended}` の
 * object 引数を要求する（`toggleEventRegistrationCheckIn` 参照）ため、bulk 版も
 * 呼び出し元から対象イベントの eventId を明示的に受け取る。
 */
export async function bulkCheckInEventRegistrations(
  eventId: string,
  ids: string[],
): Promise<MutationResult<BulkResult>> {
  const parsedEventId = eventIdSchema.safeParse(eventId);
  if (!parsedEventId.success)
    return createValidationMutationError(parsedEventId.error);

  const parsed = bulkRegistrationIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: parsedEventId.data,
    execute: async (): Promise<BulkResult> => {
      let succeeded = 0;
      let failed = 0;

      for (const id of parsed.data) {
        try {
          await setEventRegistrationCheckInCommand({
            eventId: parsedEventId.data,
            registrationId: id,
            attended: true,
          });
          succeeded++;
        } catch (error) {
          logError(normalizeError(error), {
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
            context: {
              operation: "bulkCheckInEventRegistrations",
              registrationId: id,
            },
          });
          failed++;
        }
      }

      return { succeeded, skipped: 0, failed };
    },
    afterSuccess: () => {
      invalidateEventCaches();
    },
  });
}

// =============================================================================
// 手動入金記録
// =============================================================================

const manualPaymentMethodValues = ["CASH", "BANK_TRANSFER", "OTHER"] as const;

const manualPaymentSchema = z.object({
  registrationId: eventRegistrationIdSchema,
  amount: z.number().int().min(1),
  method: z.enum(manualPaymentMethodValues),
  note: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : v)),
});

export type ManualPaymentInput = z.input<typeof manualPaymentSchema>;

/**
 * 管理者による手動入金記録（現金・銀行振込等、Stripe を経由しない入金の事後記録）。
 *
 * 支払方法 (CASH/BANK_TRANSFER/OTHER) とメモは AuditLog の `metadata` にのみ残す —
 * 専用カラムは追加しない。金額側の永続化方針（既存列の再利用と、列を足す条件）は
 * `recordManualEventPaymentCommand`
 * (`src/shared/domain/events/payment-commands.ts`) の doc を参照。
 */
export async function recordManualEventPayment(
  input: ManualPaymentInput,
): Promise<
  MutationResult<{ registrationId: string; receiptWarning?: string }>
> {
  const parsed = manualPaymentSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: parsed.data.registrationId,
    execute: async (user) => {
      const result = await recordManualEventPaymentCommand({
        registrationId: parsed.data.registrationId,
        amount: parsed.data.amount,
      });
      const { ip, userAgent } = await buildAuditRequestContext();
      return { ...result, actorUserId: user.id, ip, userAgent };
    },
    afterSuccess: (outcome) => {
      invalidateEventCaches();

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: AuditAction.UPDATE,
          resource: "event-registration",
          resourceId: parsed.data.registrationId,
          oldValue: { paymentStatus: "UNPAID" },
          newValue: { paymentStatus: "PAID", paidAmount: parsed.data.amount },
          metadata: {
            manualPaymentMethod: parsed.data.method,
            ...(parsed.data.note !== null && { note: parsed.data.note }),
            ...(outcome.ip !== null && { ip: outcome.ip }),
            ...(outcome.userAgent !== null && {
              userAgent: outcome.userAgent,
            }),
          },
        }),
        {
          operation: "auditLogRecordManualEventPayment",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
    },
  });
}

export async function createEventCheckoutSession(
  registrationId: string,
): Promise<MutationResult<{ sessionId: string; sessionUrl: string | null }>> {
  const validated = eventRegistrationIdSchema.safeParse(registrationId);
  if (!validated.success) return createValidationMutationError(validated.error);

  return executeAdminMutationResult({
    resource: "event",
    action: "update",
    resourceId: validated.data,
    execute: async () =>
      createEventCheckoutSessionCommand({
        registrationId: validated.data,
        actorCustomerId: null,
      }),
    afterSuccess: () => {
      invalidateEventCaches();
    },
  });
}
