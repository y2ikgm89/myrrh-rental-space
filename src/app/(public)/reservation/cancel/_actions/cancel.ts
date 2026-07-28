"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { verifyCancelToken } from "@/shared/lib/reservation-cancel-token";
import { tokenFingerprint } from "@/shared/lib/tokens/fingerprint";
import { reservationDeadlineNow } from "@/shared/domain/reservations/server-deadline-instant";
import { cancelReservationByToken } from "@/shared/domain/reservations/customer-commands";
import { applyCancellationSideEffects } from "@/shared/domain/reservations/cancellation-side-effects";
import { getReservationForGuestCancel } from "@/shared/domain/reservations/customer-queries";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertGuestTokenCustomerGates } from "@/shared/domain/customers/guest-token-gates";
import { getReservationDeadlineSettings } from "@/shared/domain/settings/public-queries";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  cancelByReservationRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { DomainError } from "@/shared/domain/domain-error";
import { runGuestTokenMutation } from "@/shared/domain/guest-token-actions/run-guest-mutation";

const CANCEL_TOKEN_COOKIE_NAME = "cancel-token";
const reservationIdSchema = z.uuid({ error: "予約IDが不正です" });
const reasonSchema = z
  .string()
  .trim()
  .max(500, { error: "キャンセル理由は 500 文字以内で入力してください" })
  .optional();

/**
 * ゲスト予約キャンセル（メールリンク経由）
 *
 * 共通パイプラインは `runGuestTokenMutation` に委譲。
 * トークンは HttpOnly cookie (`cancel-token`) から読む。
 *
 * @param expectedReservationId フォーム表示時点の予約 ID（秘密情報ではない）。
 */
export async function cancelGuestReservationAction(
  expectedReservationId: string,
  cancellationReason: string | null = null,
  turnstileToken?: string,
): Promise<MutationResult<null>> {
  let trimmedReason: string | null = null;

  return runGuestTokenMutation({
    operation: "guestCancelAction",
    cookieName: CANCEL_TOKEN_COOKIE_NAME,
    turnstileAction: TURNSTILE_ACTIONS.guest_reservation_cancel,
    turnstileToken,
    expectedEntityId: expectedReservationId,
    verifyNow: reservationDeadlineNow,
    verifyToken: (token, now) => {
      const verified = verifyCancelToken(token, now);
      if (!verified.valid) return verified;
      return { valid: true, entityId: verified.reservationId };
    },
    parseEntityId: (entityId) => {
      const parsed = reservationIdSchema.safeParse(entityId);
      if (!parsed.success) {
        return { success: false, message: "予約IDが不正です" };
      }
      return { success: true, data: parsed.data };
    },
    perEntityRateLimiter: cancelByReservationRateLimiter,
    perEntityRateLimitLogLimiter: "perReservation",
    perEntityRateLimitError:
      "この予約に対するキャンセル試行が多すぎます。しばらく時間をおいてから再度お試しください",
    afterEntityIdMatch: async () => {
      const parsedReason = reasonSchema.safeParse(
        cancellationReason ?? undefined,
      );
      if (!parsedReason.success) {
        return createMutationError(
          parsedReason.error.issues[0]?.message ?? "理由の形式が不正です",
        );
      }
      trimmedReason =
        parsedReason.data && parsedReason.data.length > 0
          ? parsedReason.data
          : null;
      return undefined;
    },
    guardMemberOwnership: async (entityId, sessionUserId) => {
      const reservation = await getReservationForGuestCancel(entityId);
      if (!reservation) {
        return { ok: false, error: "予約が見つかりません" };
      }

      let sessionCustomerId: string | null = null;
      if (sessionUserId) {
        const customer = await getCustomerByUserId(sessionUserId);
        if (customer && customer.id !== reservation.customerId) {
          return {
            ok: false,
            error:
              "このリンクは別のお客様のご予約です。マイページからご自身のご予約をご確認ください",
          };
        }
        sessionCustomerId = customer?.id ?? null;
      }

      try {
        await assertGuestTokenCustomerGates({
          resourceCustomerId: reservation.customerId,
          sessionCustomerId,
        });
      } catch (error) {
        if (error instanceof DomainError) {
          return { ok: false, error: error.message };
        }
        throw error;
      }

      return { ok: true, memberContext: undefined };
    },
    execute: async ({ entityId, token, sessionUserId }) => {
      try {
        const settings = await getReservationDeadlineSettings();
        const result = await cancelReservationByToken(
          entityId,
          settings.cancellationDeadlineHours,
          trimmedReason,
        );
        if (!result.success) return createMutationError(result.error);

        invalidateReservationCaches(entityId, null, {
          coupons: true,
        });

        const requestHeaders = await headers();
        const ip = await getClientIpFromHeaders();
        const userAgent = requestHeaders.get("user-agent");

        await applyCancellationSideEffects({
          reservationId: entityId,
          cancellationReason: trimmedReason,
          channel: "customer-token",
          actorUserId: sessionUserId,
          request: { ip, userAgent, tokenFingerprint: tokenFingerprint(token) },
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
