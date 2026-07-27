/**
 * 予約メール / イベント申込キャンセルメール / webhook-renewal 通知の idempotencyKey 対称性テスト。
 *
 * Resend の idempotency key は 24h 有効・同一キー再送で payload 差異があると 409
 * (`invalid_idempotent_request`) を返す。この 409 は `RETRYABLE_ERROR_NAMES`
 * (`send.ts`) に含まれないため、silent drop に近い挙動（error ログのみ）となる。
 *
 * 特に「SUPER_ADMIN が CANCELLED → CONFIRMED に復元 → 24h 内に顧客が再キャンセル」
 * のシナリオでは 2 回目の cancel メールの payload (icsSequence 増分 + CANCEL ICS 添付)
 * が 1 回目と異なるため、reservationId のみの key だと 409 で silent drop する。
 *
 * この drift gate は以下を強制する:
 * - `sendReservationCancelledEmail`: 同一 reservationId + 異なる icsSequence → 異なるキー
 * - `sendReservationCancelledEmail`: 同一 reservationId + 同一 icsSequence → 同一キー
 * - `sendReservationAdminNotification`: 同一予約 / 同一 action + 異なる icsSequence → 異なるキー
 * - `sendEventRegistrationCancelled`: 同一 registrationId + 異なる icsSequence → 異なるキー
 *   （EventRegistration には現状 restore path が無いが SSoT で対称化する）
 * - `sendWebhookRenewalNotification`: idempotencyKey が付与され `<event-type>/...` 形式で始まる
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  RENDER_CONTEXT,
  RESERVATION_ADMIN_DELIVERY,
  RESERVATION_RENDER_CONTEXT,
} from "./_email-test-fixtures";

type CapturedSendEmailParams = { idempotencyKey?: string };

const mockSendEmail = mock<
  (params: CapturedSendEmailParams) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  hashForKey: (s: string) => s,
}));
// system-emails (webhook-renewal) はまだ domain を直接読む。p3 並列作業の対象外。
mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: () =>
    Promise.resolve({
      sendReservationConfirmationEmail: true,
      notifyNewReservation: true,
      notifyReservationChange: true,
      notifyReservationCancel: true,
      notifyNewInquiry: true,
      notifyEventRegistration: true,
      notifyEventCancellation: true,
      replyToEmail: null,
    }),
  getNotificationEmailAddresses: () => Promise.resolve(["admin@example.com"]),
  getCalendarEmailSettings: () =>
    Promise.resolve({
      icalAttachmentEnabled: false,
      addToCalendarLinksEnabled: false,
    }),
}));
mock.module("@/shared/db/prisma", () => ({ prisma: {}, basePrisma: {} }));
mock.module("@/shared/emails/_shared/footer-data", () => ({
  getEmailFooterData: () =>
    Promise.resolve({
      businessName: "Org",
      address: "",
      phoneNumber: null,
      contactEmail: null,
      siteName: "Org",
      siteUrl: "https://example.com",
      legalLinks: [],
    }),
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  sendReservationCancelledEmail,
  sendReservationAdminNotification,
} from "@/shared/lib/email/reservation-emails";
// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { sendEventRegistrationCancelled } from "@/shared/lib/email/event-emails";
// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { sendWebhookRenewalNotification } from "@/shared/lib/email/system-emails";
// eslint-disable-next-line import-x/first -- mock.module must precede imports
import type { ReservationEmailData } from "@/shared/lib/email/types";
// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { EventFormat } from "@/shared/lib/validations/enums/prisma-types";

const RESERVATION_BASE: ReservationEmailData = {
  reservationId: "reservation-abcdef12",
  customerEmail: "customer@example.com",
  customerName: "山田太郎",
  spaceName: "会議室A",
  startTime: new Date("2099-01-01T01:00:00Z"),
  endTime: new Date("2099-01-01T03:00:00Z"),
  totalPrice: 5000,
  icsSequence: 0,
};

function lastKey(): string | undefined {
  return mockSendEmail.mock.calls.at(-1)?.[0]?.idempotencyKey;
}

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
});

describe("sendReservationCancelledEmail() の idempotencyKey に icsSequence が入る", () => {
  test("同一 reservationId + 異なる icsSequence → 異なるキー（restore 後 re-cancel シナリオ）", async () => {
    await sendReservationCancelledEmail(
      { ...RESERVATION_BASE, icsSequence: 0 },
      RESERVATION_RENDER_CONTEXT,
    );
    const firstKey = lastKey();

    await sendReservationCancelledEmail(
      { ...RESERVATION_BASE, icsSequence: 1 },
      RESERVATION_RENDER_CONTEXT,
    );
    const secondKey = lastKey();

    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(firstKey).not.toBe(secondKey);
  });

  test("同一 reservationId + 同一 icsSequence → 同一キー（Resend retry 冪等性）", async () => {
    await sendReservationCancelledEmail(
      { ...RESERVATION_BASE, icsSequence: 3 },
      RESERVATION_RENDER_CONTEXT,
    );
    const firstKey = lastKey();

    await sendReservationCancelledEmail(
      { ...RESERVATION_BASE, icsSequence: 3 },
      RESERVATION_RENDER_CONTEXT,
    );
    const secondKey = lastKey();

    expect(firstKey).toBeDefined();
    expect(firstKey).toBe(secondKey);
  });

  test("キーは `<event-type>/<entity-id>/<sequence>` 形式（icsSequence が末尾）", async () => {
    await sendReservationCancelledEmail(
      { ...RESERVATION_BASE, icsSequence: 7 },
      RESERVATION_RENDER_CONTEXT,
    );
    expect(lastKey()).toBe(
      `reservation-cancel/${RESERVATION_BASE.reservationId}/7`,
    );
  });
});

describe("sendReservationAdminNotification() の idempotencyKey にも icsSequence が入る", () => {
  test("同一 reservationId / 同一 action + 異なる icsSequence → 異なるキー", async () => {
    await sendReservationAdminNotification(
      { ...RESERVATION_BASE, icsSequence: 0 },
      "cancel",
      RESERVATION_ADMIN_DELIVERY,
    );
    const firstKey = lastKey();

    await sendReservationAdminNotification(
      { ...RESERVATION_BASE, icsSequence: 1 },
      "cancel",
      RESERVATION_ADMIN_DELIVERY,
    );
    const secondKey = lastKey();

    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(firstKey).not.toBe(secondKey);
  });

  test("同一 reservationId / 同一 action + 同一 icsSequence → 同一キー", async () => {
    await sendReservationAdminNotification(
      { ...RESERVATION_BASE, icsSequence: 2 },
      "cancel",
      RESERVATION_ADMIN_DELIVERY,
    );
    const firstKey = lastKey();

    await sendReservationAdminNotification(
      { ...RESERVATION_BASE, icsSequence: 2 },
      "cancel",
      RESERVATION_ADMIN_DELIVERY,
    );
    const secondKey = lastKey();

    expect(firstKey).toBeDefined();
    expect(firstKey).toBe(secondKey);
  });

  test("キーは `reservation-admin/<id>/<action>/<sequence>` 形式", async () => {
    await sendReservationAdminNotification(
      { ...RESERVATION_BASE, icsSequence: 4 },
      "cancel",
      RESERVATION_ADMIN_DELIVERY,
    );
    expect(lastKey()).toBe(
      `reservation-admin/${RESERVATION_BASE.reservationId}/cancel/4`,
    );
  });
});

describe("sendEventRegistrationCancelled() の idempotencyKey にも icsSequence が入る", () => {
  const eventBase = {
    registrationId: "registration-abcdef12",
    customerName: "参加者",
    customerEmail: "guest@example.com",
    eventTitle: "ワークショップ",
    eventStartTime: new Date("2099-01-01T01:00:00Z"),
    eventEndTime: new Date("2099-01-01T03:00:00Z"),
    location: undefined,
    quantity: 1,
    format: EventFormat.OFFLINE,
    meetingUrl: null,
  };

  test("同一 registrationId + 異なる icsSequence → 異なるキー", async () => {
    await sendEventRegistrationCancelled(
      { ...eventBase, icsSequence: 0 },
      RENDER_CONTEXT,
    );
    const firstKey = lastKey();

    await sendEventRegistrationCancelled(
      { ...eventBase, icsSequence: 1 },
      RENDER_CONTEXT,
    );
    const secondKey = lastKey();

    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(firstKey).not.toBe(secondKey);
  });

  test("キーは `event-reg-cancel/<id>/<sequence>` 形式", async () => {
    await sendEventRegistrationCancelled(
      { ...eventBase, icsSequence: 5 },
      RENDER_CONTEXT,
    );
    expect(lastKey()).toBe(`event-reg-cancel/${eventBase.registrationId}/5`);
  });
});

describe("sendWebhookRenewalNotification() は idempotencyKey が付与される", () => {
  test("成功通知は `webhook-renewal/ok/<hour>` 形式", async () => {
    await sendWebhookRenewalNotification({
      success: true,
      newExpiration: new Date("2099-01-01T00:00:00Z"),
    });

    const key = lastKey();
    expect(key).toBeDefined();
    expect(key?.startsWith("webhook-renewal/ok/")).toBe(true);
  });

  test("失敗通知は `webhook-renewal/err/<hour>` 形式", async () => {
    await sendWebhookRenewalNotification({
      success: false,
      error: "test",
    });

    const key = lastKey();
    expect(key).toBeDefined();
    expect(key?.startsWith("webhook-renewal/err/")).toBe(true);
  });

  test("同じ hour bucket 内の同結果は同一キー（Resend retry 冪等性）", async () => {
    await sendWebhookRenewalNotification({ success: true });
    const firstKey = lastKey();

    await sendWebhookRenewalNotification({ success: true });
    const secondKey = lastKey();

    expect(firstKey).toBeDefined();
    expect(firstKey).toBe(secondKey);
  });

  test("成功と失敗は別キー（同一 hour bucket でも衝突しない）", async () => {
    await sendWebhookRenewalNotification({ success: true });
    const okKey = lastKey();

    await sendWebhookRenewalNotification({ success: false, error: "test" });
    const errKey = lastKey();

    expect(okKey).not.toBe(errKey);
  });
});
