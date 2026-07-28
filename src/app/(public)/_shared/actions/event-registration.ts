"use server";

import type { SubmissionResult } from "@conform-to/react";
import { updateTag } from "next/cache";
import {
  publicEventRegistrationSchema,
  publicEventWaitlistRegistrationSchema,
} from "@/shared/lib/validations/event-registration";
import {
  checkActionRateLimit,
  checkBotHeuristics,
  checkEmailRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import {
  eventRegistrationByEmailRateLimiter,
  eventRegistrationSubmitRateLimiter,
  eventWaitlistRegistrationByEmailRateLimiter,
  eventWaitlistRegistrationSubmitRateLimiter,
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
import { registerWaitlistEntryCommand } from "@/shared/domain/events/waitlist-commands";
import { applyEventRegistrationCancellationSideEffects } from "@/shared/domain/events/registration-cancellation-side-effects";
import {
  sendEventRegistrationConfirmation,
  sendEventAdminNotification,
} from "@/shared/lib/email/event-emails";
import { sendEventWaitlistRegistered } from "@/shared/lib/email/event-waitlist-emails";
import {
  computeWaitlistPositionForRegistration,
  getWaitlistEmailRegistration,
} from "@/shared/domain/events/waitlist-queries";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import { isFeatureEnabled } from "@/shared/lib/features/check";
import { buildEventRegistrationPaymentCheckoutUrl } from "@/shared/lib/tokens/event-registration-payment-token";
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { DomainError } from "@/shared/domain/domain-error";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { getEventRegistrationDetailsForEmail } from "@/shared/domain/events/registration-queries";
import {
  assertAllRequiredTermsAgreed,
  assertLoginSignupReagreed,
} from "@/shared/domain/terms/consent-gate";
import {
  AuditAction,
  TermsScope,
} from "@/shared/lib/validations/enums/prisma-types";
import { headers } from "next/headers";
import { getClientIpFromHeaders } from "@/shared/lib/rate-limit";
import { prismaCuidIdSchema } from "@/shared/lib/validations/params";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import {
  checkPublicSiteWritable,
  getPublicMaintenanceBlockMutation,
} from "@/shared/domain/settings/maintenance-guard";

const registrationIdSchema = prismaCuidIdSchema("イベント参加申込");

export async function registerForEvent(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    publicEventRegistrationSchema,
    async (data) => {
      const maintenance = await checkPublicSiteWritable();
      if (!maintenance.ok) {
        return { ok: false, error: maintenance.error };
      }

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
          // OAUTH-BETTER-AUTH-01: 認証済みセッションで解決した Customer は
          // isActive / status BLACKLIST を強制する。
          // TERMS-REAGREE-P2: LOGIN_SIGNUP scope の再同意 pending も同ゲートで拒否。
          try {
            await assertCustomerActive(customer.id);
            await assertLoginSignupReagreed(customer.id);
          } catch (error) {
            if (error instanceof DomainError) {
              return { ok: false, error: error.message };
            }
            throw error;
          }
          customerId = customer.id;
        }
      }

      const clientIp = await getClientIpFromHeaders();
      const headersList = await headers();
      const userAgent = headersList.get("user-agent");

      try {
        // TermsAgreement は createEventRegistrationCommand 内の同一 tx で記録する
        // （申込成立と法務 evidence の atomicity。reservation 経路と同契約）。
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
          agreedTermsIds: data.agreedTermsIds,
          ipAddress: clientIp,
          userAgent: userAgent ?? null,
        });

        invalidateEventCaches();

        fireAndForget(
          (async () => {
            const event = await getEventRegistrationDetailsForEmail(
              result.registration.id,
            );
            if (!event) return;

            const ticketTotalPrice = event.ticketUnitPrice * event.quantity;
            const paymentEnabled = await isFeatureEnabled("payment");
            const paymentCheckoutUrl =
              !customerId && paymentEnabled && ticketTotalPrice > 0
                ? buildEventRegistrationPaymentCheckoutUrl(
                    result.registration.id,
                  )
                : undefined;

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
                format: event.format,
                meetingUrl: event.meetingUrl,
                ...(paymentCheckoutUrl !== undefined
                  ? { paymentCheckoutUrl }
                  : {}),
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

        // D7: 公開イベント申込 CREATE の最小監査。
        fireAndForget(
          createAuditLogRecord({
            action: AuditAction.CREATE,
            resource: "event-registration",
            resourceId: result.registration.id,
            newValue: { status: "CONFIRMED" },
            metadata: {
              channel: "public",
              customerId,
              eventId: result.registration.eventId,
            },
          }),
          {
            operation: "auditPublicEventRegistrationCreate",
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

/**
 * イベントのキャンセル待ち登録（公開フォーム、満員時）。
 *
 * `registerForEvent` と同型のパイプライン（rate limit → email rate limit →
 * bot heuristics → Turnstile → 規約同意 → customer 解決 → command →
 * 規約同意証跡 → cache invalidate → fire-and-forget メール）を、
 * `registerWaitlistEntryCommand`（advisory lock 728350 で通常申込 / キャンセルと
 * 直列化）に差し替えて実行する。
 *
 * `registerWaitlistEntryCommand` はスロット/チケットに実際は空きがある場合
 * `DomainError(..., "CONFLICT")` を throw する（フォーム分岐との整合性ガード）。
 * この場合も他の DomainError と同様 formErrors に表示する。
 */
export async function registerForEventWaitlist(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    publicEventWaitlistRegistrationSchema,
    async (data) => {
      const maintenance = await checkPublicSiteWritable();
      if (!maintenance.ok) {
        return { ok: false, error: maintenance.error };
      }

      const rateLimit = await checkActionRateLimit(
        eventWaitlistRegistrationSubmitRateLimiter,
      );
      if (!rateLimit.success) {
        return { ok: false, error: rateLimit.error };
      }

      const emailRateLimit = await checkEmailRateLimit(
        eventWaitlistRegistrationByEmailRateLimiter,
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
        expectedAction: TURNSTILE_ACTIONS.event_waitlist_register,
      });
      if (!turnstile.success) {
        return { ok: false, error: turnstile.error };
      }

      // Server-side consent gate (EVENT_REGISTRATION scope の必須規約強制。
      // 通常申込と同一 scope を共有する)
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
          // OAUTH-BETTER-AUTH-01: 認証済みセッションで解決した Customer は
          // isActive / status BLACKLIST を強制する。
          // TERMS-REAGREE-P2: LOGIN_SIGNUP scope の再同意 pending も同ゲートで拒否。
          try {
            await assertCustomerActive(customer.id);
            await assertLoginSignupReagreed(customer.id);
          } catch (error) {
            if (error instanceof DomainError) {
              return { ok: false, error: error.message };
            }
            throw error;
          }
          customerId = customer.id;
        }
      }

      const clientIp = await getClientIpFromHeaders();
      const headersList = await headers();
      const userAgent = headersList.get("user-agent");

      try {
        // TermsAgreement は registerWaitlistEntryCommand 内の同一 tx で記録する
        // （waitlist 登録と法務 evidence の atomicity。通常申込経路と同契約）。
        const result = await registerWaitlistEntryCommand({
          eventId: data.eventId,
          slotId: data.slotId,
          ticketId: data.ticketId,
          name: data.name,
          email: data.email,
          phone: data.phone ?? null,
          note: data.note ?? null,
          quantity: data.quantity,
          customerId,
          agreedTermsIds: data.agreedTermsIds,
          ipAddress: clientIp,
          userAgent: userAgent ?? null,
        });

        invalidateSiteWideCache([CACHE_TAGS.EVENTS, CACHE_TAGS.EVENT_WAITLIST]);

        fireAndForget(
          (async () => {
            // 参加者宛と admin 宛を並列送信。admin 通知は satisfies 網羅型で type
            // 追加漏れを compile-time に検知させる。eventTitle / capacity /
            // confirmedCount は getEventRegistrationDetailsForEmail 経由で load
            // (registerForEvent path と対称)。
            const [event, registration] = await Promise.all([
              getEventRegistrationDetailsForEmail(result.registration.id),
              getWaitlistEmailRegistration(result.registration.id),
            ]);
            if (!registration) return;

            const position =
              await computeWaitlistPositionForRegistration(registration);

            await Promise.all([
              sendEventWaitlistRegistered({
                registration,
                position,
                to: data.email,
              }),
              event
                ? sendEventAdminNotification(
                    {
                      registrationId: result.registration.id,
                      eventId: data.eventId,
                      participantName: data.name,
                      participantEmail: data.email,
                      eventTitle: event.eventTitle,
                      eventStartTime: event.startTime,
                      quantity: data.quantity,
                      currentRegistrations: event.confirmedCount,
                      capacity: event.capacity,
                    },
                    "waitlist_registration",
                  )
                : Promise.resolve(),
            ]);
          })(),
          {
            operation: "sendEventWaitlistRegistrationEmails",
            category: ErrorCategory.EXTERNAL_API,
          },
        );

        fireAndForget(
          createNotificationCommand({
            type: NOTIFICATION_TYPE.EVENT_WAITLIST_REGISTRATION,
            title:
              NOTIFICATION_TYPE_LABELS[
                NOTIFICATION_TYPE.EVENT_WAITLIST_REGISTRATION
              ],
            message: `${data.name}様が「${result.event.title}」のキャンセル待ちに登録しました`,
            resourceType: "event",
            resourceId: data.eventId,
          }),
          {
            operation: "createEventWaitlistRegistrationNotification",
            category: ErrorCategory.DATABASE,
          },
        );

        // D7: 公開 waitlist 登録 CREATE の最小監査（通常申込と同型、channel のみ waitlist）。
        fireAndForget(
          createAuditLogRecord({
            action: AuditAction.CREATE,
            resource: "event-registration",
            resourceId: result.registration.id,
            newValue: { status: "WAITLISTED" },
            metadata: {
              channel: "waitlist",
              customerId,
              eventId: data.eventId,
            },
          }),
          {
            operation: "auditPublicEventWaitlistRegistrationCreate",
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
  const maintenanceBlock = await getPublicMaintenanceBlockMutation();
  if (maintenanceBlock) return maintenanceBlock;

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
    // OAUTH-BETTER-AUTH-01: Customer.isActive / status BLACKLIST を
    // Server Action 側でも強制する（MypageAuthGate は SC 描画層のみカバー）。
    // TERMS-REAGREE-P2: LOGIN_SIGNUP scope の再同意 pending も同ゲートで拒否。
    await assertCustomerActive(customer.id);
    await assertLoginSignupReagreed(customer.id);

    // FEAT-3PLANE-04: 詳細ページは events gate 済みだが、Server Action は
    // 直接呼び出せるため fail-closed する (cancelReservationAction と同型)。
    if (!(await isFeatureEnabled("events"))) {
      return createMutationError(
        "この機能は現在利用できません。管理者にお問い合わせください。",
      );
    }

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
      promoted: registration.promoted,
    });

    return null;
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
