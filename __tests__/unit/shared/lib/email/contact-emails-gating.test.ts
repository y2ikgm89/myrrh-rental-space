/**
 * お問い合わせ管理者通知メールの lib 側ゲート（通知先アドレス）テスト
 *
 * sendContactAdminNotification は delivery.notificationEmails が空なら送信しない。
 * notifyNewInquiry 等の toggle は domain が resolve して delivery DTO に反映する。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockSendEmail = mock<
  (...args: unknown[]) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
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

import { EMAIL_SEND_CONTEXT } from "./_email-test-fixtures";
// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { sendContactAdminNotification } from "@/shared/lib/email/contact-emails";
import type { ContactEmailData } from "@/shared/lib/email/types";

const DATA: ContactEmailData = {
  inquiryId: "inquiry-abcdef123456",
  receiptNumber: "INQ-ABCDEF12",
  name: "山田太郎",
  email: "customer@example.com",
  subject: "テストの件",
  message: "お問い合わせ本文",
};

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
});

describe("sendContactAdminNotification() の配信ゲート", () => {
  test("通知先アドレスが空なら sendEmail を呼ばず disabled を返す", async () => {
    const result = await sendContactAdminNotification(
      DATA,
      { notificationEmails: [] },
      EMAIL_SEND_CONTEXT,
    );

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("宛先ありなら sendEmail を呼ぶ", async () => {
    await sendContactAdminNotification(
      DATA,
      { notificationEmails: ["admin@example.com"] },
      EMAIL_SEND_CONTEXT,
    );

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
