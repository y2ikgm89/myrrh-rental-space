"use server";

import type { SubmissionResult } from "@conform-to/react";
import { publicEventWaitlistConfirmSchema } from "@/shared/lib/validations/event-registration";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import { eventWaitlistConfirmRateLimiter } from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { verifyWaitlistOfferToken } from "@/shared/lib/tokens/waitlist-offer-token";
import { validateTurnstile } from "@/shared/domain/settings/turnstile";
import { confirmWaitlistOfferCommand } from "@/shared/domain/events/waitlist-commands";
import {
  getEventRegistrationForConfirm,
  getWaitlistConfirmationEmailDetails,
} from "@/shared/domain/events/waitlist-queries";
import { fireEventWaitlistConfirmedAdminNotification } from "@/shared/domain/events/waitlist-admin-notification-side-effects";
import { sendEventRegistrationConfirmation } from "@/shared/lib/email/event-emails";
import { getEventEmailRenderContext } from "@/shared/domain/settings/queries/email-render-context";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { DomainError } from "@/shared/domain/domain-error";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertGuestTokenCustomerGates } from "@/shared/domain/customers/guest-token-gates";
import { getPublicMaintenanceBlockMutation } from "@/shared/lib/maintenance-guard";

/**
 * イベント waitlist 繰り上げ当選の確定（無料チケット、公開フォーム）。
 *
 * rate limit（IP・token 単位の第二防壁は eventWaitlistConfirmRateLimiter 自体が
 * 兼ねる）→ Turnstile → token 検証 → mismatch ガード → confirmWaitlistOfferCommand
 * → cache invalidate → fire-and-forget 確認メールの順で処理する。
 *
 * honeypot / formRenderedAt は無し（単発クリックの確認フォームであり
 * publicEventWaitlistConfirmSchema 自体にそのフィールドが無いため、
 * registerForEvent 系のパイプラインとは Bot ヒューリスティクス段が無い点で異なる）。
 */
export async function confirmWaitlistOfferAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    publicEventWaitlistConfirmSchema,
    async (data) => {
      const maintenanceBlock = await getPublicMaintenanceBlockMutation();
      if (maintenanceBlock) {
        return { ok: false, error: maintenanceBlock.error };
      }

      const rateLimit = await checkActionRateLimit(
        eventWaitlistConfirmRateLimiter,
      );
      if (!rateLimit.success) {
        return { ok: false, error: rateLimit.error };
      }

      const turnstile = await validateTurnstile({
        token: data.turnstileToken,
        expectedAction: TURNSTILE_ACTIONS.event_waitlist_confirm,
      });
      if (!turnstile.success) {
        return { ok: false, error: turnstile.error };
      }

      const verified = verifyWaitlistOfferToken(data.token);
      if (!verified) {
        return { ok: false, error: "リンクが無効または期限切れです" };
      }
      const { registrationId } = verified;

      // member-ownership + linked-customer gates（events/cancel と同型）。
      // token 保持が一次認可のため、非ログイン時は expectedCustomerId フィルタを
      // 掛けない（別デバイス確定を妨げない）。紐付き customerId がある場合は
      // session の有無に関わらず active/BLACKLIST を強制し、session があるときは
      // LOGIN_SIGNUP 再同意も mypage と同型に強制する。
      const registration = await getEventRegistrationForConfirm(registrationId);
      if (!registration) {
        return { ok: false, error: "対象の申込が見つかりません" };
      }

      const session = await getCustomerSession();
      const sessionUserId = session?.user.id ?? null;
      let expectedCustomerId: string | null | undefined;
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
              "このリンクは別のお客様の繰り上げ当選です。マイページからご確認ください",
          };
        }
        sessionCustomerId = customer?.id ?? null;
        expectedCustomerId = registration.customerId;
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

      try {
        // exactOptionalPropertyTypes: expectedCustomerId が undefined の場合は
        // キー自体を省略する（`expectedCustomerId: undefined` の明示代入は
        // `string | null` 型のオプショナルプロパティでは不可）。
        const result = await confirmWaitlistOfferCommand({
          registrationId,
          now: new Date(),
          ...(expectedCustomerId !== undefined ? { expectedCustomerId } : {}),
        });

        if (result.registration.status === "EXPIRED") {
          return {
            ok: false,
            error:
              "繰り上げ当選の確定期限を過ぎました。イベント一覧から再度キャンセル待ちにご登録ください",
          };
        }

        invalidateSiteWideCache([CACHE_TAGS.EVENTS, CACHE_TAGS.EVENT_WAITLIST]);

        // D7: waitlist 確定 (OFFERED → CONFIRMED) の最小監査。
        fireAndForget(
          createAuditLogRecord({
            action: AuditAction.UPDATE,
            resource: "event-registration",
            resourceId: result.registration.id,
            newValue: { status: result.registration.status },
            metadata: {
              channel: "public",
              operation: "waitlist_confirm",
              customerId: expectedCustomerId ?? null,
            },
          }),
          {
            operation: "auditPublicWaitlistConfirm",
            category: ErrorCategory.DATABASE,
          },
        );

        fireAndForget(
          (async () => {
            const details = await getWaitlistConfirmationEmailDetails(
              result.registration.id,
            );
            if (!details) return;
            const renderContext = await getEventEmailRenderContext();
            await sendEventRegistrationConfirmation(
              {
                registrationId: details.id,
                customerName: details.name,
                customerEmail: details.email,
                eventTitle: details.eventTitle,
                eventStartTime: details.startTime,
                eventEndTime: details.endTime,
                location: details.location ?? undefined,
                quantity: details.quantity,
                icsSequence: details.icsSequence,
                customerId: details.customerId,
                format: details.format,
                meetingUrl: details.meetingUrl,
              },
              renderContext,
            );
          })(),
          {
            operation: "sendWaitlistConfirmationEmail",
            category: ErrorCategory.EXTERNAL_API,
          },
        );

        fireEventWaitlistConfirmedAdminNotification(result.registration.id);

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
