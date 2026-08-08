/**
 * お問い合わせ続報（顧客返信）管理者通知メールの lib 側配信ゲート
 * （宛先空 = disabled）テスト。toggle 解決は domain が担う。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockSendEmail = mock<
  (...args: unknown[]) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  hashForKey: (value: string) => value.slice(0, 8),
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
  EMAIL_SEND_CONTEXT,
  INQUIRY_ADMIN_DELIVERY,
} from "./_email-test-fixtures";

import { sendInquiryCustomerReplyAdminEmail } from "@/shared/lib/email/inquiry-emails";
import type { InquiryCustomerReplyAdminEmailData } from "@/shared/lib/email/types";

const DATA: InquiryCustomerReplyAdminEmailData = {
  inquiryId: "inquiry-abcdef123456",
  receiptNumber: "INQ-ABCDEF12",
  customerName: "山田太郎",
  subject: "テストの件",
  replyMessage: "追加の質問があります。",
};

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
});

describe("sendInquiryCustomerReplyAdminEmail() の宛先ゲート", () => {
  test("通知先アドレスが空なら sendEmail を呼ばず disabled を返す", async () => {
    const result = await sendInquiryCustomerReplyAdminEmail(
      DATA,
      { notificationEmails: [] },
      EMAIL_SEND_CONTEXT,
    );

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("宛先ありなら sendEmail を呼ぶ", async () => {
    await sendInquiryCustomerReplyAdminEmail(
      DATA,
      INQUIRY_ADMIN_DELIVERY,
      EMAIL_SEND_CONTEXT,
    );

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
