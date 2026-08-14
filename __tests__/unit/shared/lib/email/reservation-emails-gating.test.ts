/**
 * 予約管理者通知メールの lib 側配信ゲート（宛先空 = disabled）テスト。
 * toggle × 宛先の解決は domain `email-render-context` が担う。
 * 顧客確認メールの Settings トグルも domain 側（isReservationConfirmationEmailEnabled）。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import {
  EMAIL_SEND_CONTEXT,
  RESERVATION_ADMIN_DELIVERY,
} from "./_email-test-fixtures";

const mockSendEmail = mock<
  (...args: unknown[]) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));

mock.module("@/shared/lib/email/send", () => ({ sendEmail: mockSendEmail }));
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

import { sendReservationAdminNotification } from "@/shared/lib/email/reservation-emails";
import type { ReservationEmailData } from "@/shared/lib/email/types";

const DATA: ReservationEmailData = {
  reservationId: "reservation-abcdef12",
  customerEmail: "customer@example.com",
  customerName: "山田太郎",
  spaceName: "会議室A",
  startTime: new Date("2099-01-01T01:00:00Z"),
  endTime: new Date("2099-01-01T03:00:00Z"),
  totalPriceWithTax: 5000,
  icsSequence: 0,
};

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
});

describe("sendReservationAdminNotification() の宛先ゲート", () => {
  test("通知先アドレスが空なら送信しない", async () => {
    const result = await sendReservationAdminNotification(
      DATA,
      "new",
      {
        notificationEmails: [],
      },
      EMAIL_SEND_CONTEXT,
    );

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("宛先ありなら送信する", async () => {
    await sendReservationAdminNotification(
      DATA,
      "update",
      RESERVATION_ADMIN_DELIVERY,
      EMAIL_SEND_CONTEXT,
    );

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
