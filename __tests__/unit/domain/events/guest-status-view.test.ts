import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  createEventRegistrationStatusToken,
  EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS,
} from "@/shared/lib/event-registration-status-token";
import { verifyCancelToken } from "@/shared/lib/event-registration-cancel-token";
import {
  buildGuestCancelHref,
  buildGuestReceiptDownloadHref,
  resolveGuestEventRegistrationStatusAccess,
  shouldShowGuestClaimLink,
} from "@/shared/domain/events/guest-status-view";
import { verifyReceiptDownloadToken } from "@/shared/lib/receipt-download-token";
import { receiptDownloadNow } from "@/shared/domain/receipts/server-download-instant";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";

describe("resolveGuestEventRegistrationStatusAccess", () => {
  const registrationId = "clxxxxxxxxxxxxxxxxxxxxxxxxx";
  const now = new Date("2026-04-01T00:00:00Z");
  const expiresAt = new Date(
    now.getTime() + EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS,
  );

  test("rate limit 超過時は rate_limited", () => {
    expect(
      resolveGuestEventRegistrationStatusAccess({
        token: "any",
        rateLimitSuccess: false,
        now,
      }),
    ).toEqual({ kind: "rate_limited" });
  });

  test("token なしは invalid", () => {
    expect(
      resolveGuestEventRegistrationStatusAccess({
        token: null,
        rateLimitSuccess: true,
        now,
      }),
    ).toEqual({ kind: "invalid" });
  });

  test("無効 token は invalid", () => {
    expect(
      resolveGuestEventRegistrationStatusAccess({
        token: "not-a-token",
        rateLimitSuccess: true,
        now,
      }),
    ).toEqual({ kind: "invalid" });
  });

  test("有効 token は registrationId を返す", () => {
    const token = createEventRegistrationStatusToken(registrationId, expiresAt);
    expect(
      resolveGuestEventRegistrationStatusAccess({
        token,
        rateLimitSuccess: true,
        now,
      }),
    ).toEqual({ kind: "ok", registrationId });
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
  test("未ログインかつ customerId null のとき claim を表示", () => {
    expect(
      shouldShowGuestClaimLink({ customerId: null, isLoggedIn: false }),
    ).toBe(true);
  });

  test("ログイン済みなら claim を非表示", () => {
    expect(
      shouldShowGuestClaimLink({ customerId: null, isLoggedIn: true }),
    ).toBe(false);
  });

  test("customer 紐付け済みなら claim を非表示", () => {
    expect(
      shouldShowGuestClaimLink({
        customerId: randomUUID(),
        isLoggedIn: false,
      }),
    ).toBe(false);
  });
});

describe("buildGuestCancelHref", () => {
  const registrationId = "clxxxxxxxxxxxxxxxxxxxxxxxxx";
  const now = new Date("2026-04-01T00:00:00Z");
  const slotStartAt = new Date("2026-04-05T00:00:00Z");

  test("CONFIRMED かつ期限前なら /events/cancel?token= を返す", () => {
    const href = buildGuestCancelHref({
      registrationId,
      status: RegistrationStatus.CONFIRMED,
      slotStartAt,
      now,
    });
    expect(href).toMatch(/^\/events\/cancel\?token=[A-Za-z0-9_-]+$/);

    const token = new URL(href ?? "", "https://example.com").searchParams.get(
      "token",
    );
    expect(token).toBeTruthy();
    const verified = verifyCancelToken(token ?? "", now);
    expect(verified.valid).toBe(true);
    if (verified.valid) {
      expect(verified.registrationId).toBe(registrationId);
    }
  });

  test("CANCELLED は null", () => {
    expect(
      buildGuestCancelHref({
        registrationId,
        status: RegistrationStatus.CANCELLED,
        slotStartAt,
        now,
      }),
    ).toBeNull();
  });

  test("スロット開始後は null", () => {
    expect(
      buildGuestCancelHref({
        registrationId,
        status: RegistrationStatus.CONFIRMED,
        slotStartAt: new Date("2026-03-31T00:00:00Z"),
        now,
      }),
    ).toBeNull();
  });
});
