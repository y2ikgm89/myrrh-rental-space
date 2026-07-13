"use server";

import type { SubmissionResult } from "@conform-to/react";
import { publicEventWaitlistConfirmSchema } from "@/shared/lib/validations/event-registration";
import {
  checkActionRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import { eventWaitlistConfirmRateLimiter } from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { verifyWaitlistOfferToken } from "@/shared/lib/tokens/waitlist-offer-token";
import { confirmWaitlistOfferCommand } from "@/shared/domain/events/waitlist-commands";
import {
  getEventRegistrationForConfirm,
  getWaitlistConfirmationEmailDetails,
} from "@/shared/domain/events/waitlist-queries";
import { sendEventRegistrationConfirmation } from "@/shared/lib/email/event-emails";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import { DomainError } from "@/shared/domain/domain-error";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";

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

      // ログイン中は「別のお客様の申込」誤操作を防ぐ mismatch ガードを行う
      // (events/cancel の cancelGuestEventRegistrationAction と同型パターン —
      // confirmWaitlistOfferCommand の JSDoc が同関数との「symmetry」を明示的に
      // 予告している)。token 保持自体が一次認可のため、非ログイン時は
      // customerId フィルタを掛けずに通す（別デバイス・別ブラウザでの確定を
      // 妨げない）。
      const session = await getCustomerSession();
      const sessionUserId = session?.user.id ?? null;
      let expectedCustomerId: string | null | undefined;
      if (sessionUserId) {
        const registration =
          await getEventRegistrationForConfirm(registrationId);
        if (!registration) {
          return { ok: false, error: "対象の申込が見つかりません" };
        }
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
        expectedCustomerId = registration.customerId;
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

        invalidateSiteWideCache([CACHE_TAGS.EVENTS]);

        fireAndForget(
          (async () => {
            const details = await getWaitlistConfirmationEmailDetails(
              result.registration.id,
            );
            if (!details) return;
            await sendEventRegistrationConfirmation({
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
            });
          })(),
          {
            operation: "sendWaitlistConfirmationEmail",
            category: ErrorCategory.EXTERNAL_API,
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
