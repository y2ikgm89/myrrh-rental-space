import "server-only";

import { canCustomerInitiateCancellation } from "@/shared/domain/reservations/cancel-core";
import { createReceiptDownloadToken } from "@/shared/lib/receipt-download-token";
import {
  computeCancelTokenExpiresAt,
  createCancelToken,
} from "@/shared/lib/reservation-cancel-token";
import { verifyStatusToken } from "@/shared/lib/reservation-status-token";
import type {
  PaymentStatus,
  ReservationStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import { buildGuestEditHref } from "./edit-eligibility";

export { buildGuestEditHref };

export type GuestStatusAccessResult =
  | { kind: "invalid" }
  | { kind: "rate_limited" }
  | { kind: "ok"; reservationId: string };

/**
 * `/reservation/status` の token + rate-limit gate。
 * page.tsx と unit test で共有する。
 */
export function resolveGuestStatusAccess(input: {
  token: string | null;
  rateLimitSuccess: boolean;
  now: Date;
}): GuestStatusAccessResult {
  if (!input.rateLimitSuccess) {
    return { kind: "rate_limited" };
  }
  if (!input.token) {
    return { kind: "invalid" };
  }
  const verified = verifyStatusToken(input.token, input.now);
  if (!verified.valid) {
    return { kind: "invalid" };
  }
  return { kind: "ok", reservationId: verified.reservationId };
}

/** ゲスト向け領収書 DL は confirm page 経由（HTTP-02）。 */
export function buildGuestReceiptDownloadHref(serialNo: string): string {
  const token = createReceiptDownloadToken(serialNo);
  return `/receipts/${serialNo}/download?token=${token}`;
}

/** claim CTA: 未ログインかつ customer が会員未紐付けのときのみ。 */
export function shouldShowGuestClaimLink(input: {
  customerUserId: string | null;
  isLoggedIn: boolean;
}): boolean {
  return !input.isLoggedIn && input.customerUserId == null;
}

/**
 * ゲスト向けキャンセル導線 URL。
 * キャンセル可能ステータス・期限内・決済処理中でないときのみ返す。
 */
export function buildGuestCancelHref(input: {
  reservationId: string;
  status: ReservationStatus;
  paymentStatus: PaymentStatus;
  startTime: Date;
  cancellationDeadlineHours: number;
  now: Date;
}): string | null {
  if (
    !canCustomerInitiateCancellation({
      status: input.status,
      paymentStatus: input.paymentStatus,
      startTime: input.startTime,
      cancellationDeadlineHours: input.cancellationDeadlineHours,
      now: input.now,
    })
  ) {
    return null;
  }
  const expiresAt = computeCancelTokenExpiresAt(
    input.startTime,
    input.cancellationDeadlineHours,
    input.now,
  );
  if (expiresAt.getTime() <= input.now.getTime()) {
    return null;
  }
  const token = createCancelToken(input.reservationId, expiresAt, input.now);
  return `/reservation/cancel?token=${token}`;
}
