/**
 * イベント管理者通知メールの lib 側配信ゲート（宛先空 = disabled）テスト。
 * toggle × 宛先の解決は domain `email-render-context` が担う。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockSendEmail = mock<
  (...args: unknown[]) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  hashForKey: (s: string) => s,
}));
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

import {
  ADMIN_DELIVERY,
  EMAIL_SEND_CONTEXT,
  INQUIRY_ADMIN_DELIVERY,
  RENDER_CONTEXT,
} from "./_email-test-fixtures";
// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { sendEventAdminNotification } from "@/shared/lib/email/event-emails";

const DATA = {
  registrationId: "registration-abcd12",
  eventId: "event-abcd12",
  participantName: "山田太郎",
  participantEmail: "participant@example.com",
  eventTitle: "ワークショップ",
  eventStartTime: new Date("2099-01-01T01:00:00Z"),
  quantity: 1,
  currentRegistrations: 5,
  capacity: 10,
};

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
});

describe("sendEventAdminNotification() の宛先ゲート", () => {
  test("通知先アドレスが空なら送信しない", async () => {
    const result = await sendEventAdminNotification(
      DATA,
      "registration",
      {
        notificationEmails: [],
      },
      EMAIL_SEND_CONTEXT,
    );

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("宛先ありなら送信する", async () => {
    await sendEventAdminNotification(
      DATA,
      "registration",
      ADMIN_DELIVERY,
      EMAIL_SEND_CONTEXT,
    );

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
