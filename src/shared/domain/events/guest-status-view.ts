import "server-only";

import { createReceiptDownloadToken } from "@/shared/lib/receipt-download-token";
import {
  computeCancelTokenExpiresAt,
  createCancelToken,
} from "@/shared/lib/event-registration-cancel-token";
import { verifyEventRegistrationStatusToken } from "@/shared/lib/event-registration-status-token";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import { buildGuestEventRegistrationEditHref as buildGuestEventRegistrationEditHrefFromEligibility } from "@/shared/domain/events/edit-eligibility";

export type GuestEventRegistrationStatusAccessResult =
  | { kind: "invalid" }
  | { kind: "rate_limited" }
  | { kind: "ok"; registrationId: string };

/**
 * `/events/registrations/status` の token + rate-limit gate。
 * page.tsx と unit test で共有する。
 */
export function resolveGuestEventRegistrationStatusAccess(input: {
  token: string | null;
  rateLimitSuccess: boolean;
  now: Date;
}): GuestEventRegistrationStatusAccessResult {
  if (!input.rateLimitSuccess) {
    return { kind: "rate_limited" };
  }
  if (!input.token) {
    return { kind: "invalid" };
  }
  const verified = verifyEventRegistrationStatusToken(input.token, input.now);
  if (!verified.valid) {
    return { kind: "invalid" };
  }
  return { kind: "ok", registrationId: verified.registrationId };
}

/** ゲスト向け領収書 DL は confirm page 経由（HTTP-02）。 */
export function buildGuestReceiptDownloadHref(serialNo: string): string {
  const token = createReceiptDownloadToken(serialNo);
  return `/receipts/${serialNo}/download?token=${token}`;
}

/** claim CTA: 未ログインかつ customer 未紐付けのときのみ。 */
export function shouldShowGuestClaimLink(input: {
  customerId: string | null;
  isLoggedIn: boolean;
}): boolean {
  return !input.isLoggedIn && input.customerId == null;
}

/**
 * ゲスト向けキャンセル導線 URL。
 * CONFIRMED かつ cancel token の期限が未来のときのみ返す。
 */
export function buildGuestCancelHref(input: {
  registrationId: string;
  status: RegistrationStatus;
  slotStartAt: Date;
  now: Date;
}): string | null {
  if (input.status !== RegistrationStatus.CONFIRMED) {
    return null;
  }
  const expiresAt = computeCancelTokenExpiresAt(input.slotStartAt, input.now);
  if (expiresAt.getTime() <= input.now.getTime()) {
    return null;
  }
  const token = createCancelToken(input.registrationId, expiresAt, input.now);
  return `/events/cancel?token=${token}`;
}

/** ゲスト向け申込内容変更導線 URL。編集可能なときのみ返す。 */
export function buildGuestEventRegistrationEditHref(input: {
  status: RegistrationStatus;
  paymentStatus: string;
  slotStartAt: Date;
  now: Date;
}): string | null {
  return buildGuestEventRegistrationEditHrefFromEligibility(input);
}
