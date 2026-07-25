import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  createStatusToken,
  STATUS_TOKEN_LIFETIME_MS,
} from "@/shared/lib/reservation-status-token";
import {
  buildGuestReceiptDownloadHref,
  resolveGuestStatusAccess,
  shouldShowGuestClaimLink,
} from "@/shared/domain/reservations/guest-status-view";
import { verifyReceiptDownloadToken } from "@/shared/lib/receipt-download-token";
import { receiptDownloadNow } from "@/shared/domain/receipts/server-download-instant";

describe("resolveGuestStatusAccess", () => {
  const reservationId = randomUUID();
  const now = new Date("2026-04-01T00:00:00Z");
  const expiresAt = new Date(now.getTime() + STATUS_TOKEN_LIFETIME_MS);

  test("rate limit 超過時は rate_limited", () => {
    expect(
      resolveGuestStatusAccess({
        token: "any",
        rateLimitSuccess: false,
        now,
      }),
    ).toEqual({ kind: "rate_limited" });
  });

  test("token なしは invalid", () => {
    expect(
      resolveGuestStatusAccess({
        token: null,
        rateLimitSuccess: true,
        now,
      }),
    ).toEqual({ kind: "invalid" });
  });

  test("無効 token は invalid", () => {
    expect(
      resolveGuestStatusAccess({
        token: "not-a-token",
        rateLimitSuccess: true,
        now,
      }),
    ).toEqual({ kind: "invalid" });
  });

  test("有効 token は reservationId を返す", () => {
    const token = createStatusToken(reservationId, expiresAt);
    expect(
      resolveGuestStatusAccess({
        token,
        rateLimitSuccess: true,
        now,
      }),
    ).toEqual({ kind: "ok", reservationId });
  });
});

describe("buildGuestReceiptDownloadHref", () => {
  test("confirm page 経由の URL を生成する", () => {
    const serialNo = "2026-000001";
    const href = buildGuestReceiptDownloadHref(serialNo);
    expect(href).toMatch(
      /^\/receipts\/2026-000001\/download\?token=[A-Za-z0-9_-]+$/,
    );

    const token = new URL(href, "https://example.com").searchParams.get(
      "token",
    );
    expect(token).toBeTruthy();
    const verified = verifyReceiptDownloadToken(
      token ?? "",
      receiptDownloadNow(),
    );
    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.serialNo).toBe(serialNo);
    }
  });
});

describe("shouldShowGuestClaimLink", () => {
  test("未ログインかつ customer.userId null のとき claim を表示", () => {
    expect(
      shouldShowGuestClaimLink({ customerUserId: null, isLoggedIn: false }),
    ).toBe(true);
  });

  test("ログイン済みなら claim を非表示", () => {
    expect(
      shouldShowGuestClaimLink({ customerUserId: null, isLoggedIn: true }),
    ).toBe(false);
  });

  test("customer が会員紐付け済みなら claim を非表示", () => {
    expect(
      shouldShowGuestClaimLink({
        customerUserId: randomUUID(),
        isLoggedIn: false,
      }),
    ).toBe(false);
  });
});
