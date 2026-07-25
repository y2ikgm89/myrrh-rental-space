import "server-only";

import { createReceiptDownloadToken } from "@/shared/lib/receipt-download-token";
import { verifyStatusToken } from "@/shared/lib/reservation-status-token";

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
