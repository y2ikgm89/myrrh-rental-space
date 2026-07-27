"use server";

import { headers } from "next/headers";
import { verifyCancelToken } from "@/shared/lib/event-registration-cancel-token";
import { tokenFingerprint } from "@/shared/lib/tokens/fingerprint";
import { cancelEventRegistrationByToken } from "@/shared/domain/events/registration-commands";
import { applyEventRegistrationCancellationSideEffects } from "@/shared/domain/events/registration-cancellation-side-effects";
import { getEventRegistrationForGuestCancel } from "@/shared/domain/events/registration-queries";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertGuestTokenCustomerGates } from "@/shared/domain/customers/guest-token-gates";
import { invalidateEventCaches } from "@/shared/lib/cache/event-cache";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  cancelByEventRegistrationRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { prismaCuidIdSchema } from "@/shared/lib/validations/params";
import { DomainError } from "@/shared/domain/domain-error";
import { validateTurnstile } from "@/shared/domain/settings/turnstile";
import { runGuestTokenMutation } from "@/shared/lib/guest-token-actions/run-guest-mutation";

const EVENT_CANCEL_TOKEN_COOKIE_NAME = "event-cancel-token";
const registrationIdSchema = prismaCuidIdSchema("イベント参加申込");

type EventMemberContext = {
  expectedCustomerId: string | null | undefined;
};

/**
 * ゲストイベント参加申込キャンセル（メールリンク経由）
 *
 * 共通パイプラインは `runGuestTokenMutation` に委譲。
 * トークンは HttpOnly cookie (`event-cancel-token`) から読む。
 *
 * @param expectedRegistrationId フォーム表示時点の申込 ID（秘密情報ではない）。
 */
export async function cancelGuestEventRegistrationAction(
  expectedRegistrationId: string,
  turnstileToken?: string,
): Promise<MutationResult<null>> {
  return runGuestTokenMutation<EventMemberContext>({
    operation: "guestEventCancelAction",
    cookieName: EVENT_CANCEL_TOKEN_COOKIE_NAME,
    turnstileAction: TURNSTILE_ACTIONS.guest_event_registration_cancel,
    turnstileToken,
    validateTurnstile,
    expectedEntityId: expectedRegistrationId,
    verifyNow: () => new Date(),
    verifyToken: (token, now) => {
      const verified = verifyCancelToken(token, now);
      if (!verified.valid) return verified;
      return { valid: true, entityId: verified.registrationId };
    },
    parseEntityId: (entityId) => {
      const parsed = registrationIdSchema.safeParse(entityId);
      if (!parsed.success) {
        return { success: false, message: "申込IDが不正です" };
      }
      return { success: true, data: parsed.data };
    },
    perEntityRateLimiter: cancelByEventRegistrationRateLimiter,
    perEntityRateLimitLogLimiter: "perRegistration",
    perEntityRateLimitError:
      "この申込に対するキャンセル試行が多すぎます。しばらく時間をおいてから再度お試しください",
    guardMemberOwnership: async (entityId, sessionUserId) => {
      // EventRegistration.customerId は nullable（未 claim のゲスト申込は null）。
      // null の間は ownership mismatch を適用しない。
      const registration = await getEventRegistrationForGuestCancel(entityId);
      if (!registration) {
        return { ok: false, error: "申込が見つかりません" };
      }

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
              "このリンクは別のお客様のご参加申込です。マイページからご自身の申込をご確認ください",
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

      return {
        ok: true,
        memberContext: { expectedCustomerId },
      };
    },
    execute: async ({ entityId, token, sessionUserId, memberContext }) => {
      try {
        const result = await cancelEventRegistrationByToken(
          entityId,
          memberContext?.expectedCustomerId,
        );

        invalidateEventCaches();

        const requestHeaders = await headers();
        const ip = await getClientIpFromHeaders();
        const userAgent = requestHeaders.get("user-agent");

        await applyEventRegistrationCancellationSideEffects({
          registrationId: result.id,
          channel: "customer-token",
          actorUserId: sessionUserId,
          request: { ip, userAgent, tokenFingerprint: tokenFingerprint(token) },
          promoted: result.promoted,
        });

        return null;
      } catch (error) {
        if (error instanceof DomainError) {
          return createMutationError(error.message);
        }
        throw error;
      }
    },
  });
}
