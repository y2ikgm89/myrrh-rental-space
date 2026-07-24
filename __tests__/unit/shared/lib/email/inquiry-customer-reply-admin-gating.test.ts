/**
 * お問い合わせ続報（顧客返信）管理者通知メールの配信ゲート
 * （notifyInquiryCustomerReply / 通知先アドレス）テスト
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

type DeliverySettings = {
  sendReservationConfirmationEmail: boolean;
  notifyNewReservation: boolean;
  notifyReservationChange: boolean;
  notifyReservationCancel: boolean;
  notifyNewInquiry: boolean;
  notifyInquiryCustomerReply: boolean;
  replyToEmail: string | null;
};

const DELIVERY_DEFAULTS: DeliverySettings = {
  sendReservationConfirmationEmail: true,
  notifyNewReservation: true,
  notifyReservationChange: true,
  notifyReservationCancel: true,
  notifyNewInquiry: true,
  notifyInquiryCustomerReply: true,
  replyToEmail: null,
};

const mockSendEmail = mock<
  (...args: unknown[]) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));
const mockGetEmailDeliverySettings = mock<() => Promise<DeliverySettings>>(() =>
  Promise.resolve(DELIVERY_DEFAULTS),
);
const mockGetNotificationEmailAddresses = mock<() => Promise<string[]>>(() =>
  Promise.resolve(["admin@example.com"]),
);

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  hashForKey: (value: string) => value.slice(0, 8),
}));

mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mockGetEmailDeliverySettings,
  getNotificationEmailAddresses: mockGetNotificationEmailAddresses,
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

// eslint-disable-next-line import-x/first -- mock.module must precede imports
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
  mockGetEmailDeliverySettings.mockReset();
  mockGetEmailDeliverySettings.mockResolvedValue(DELIVERY_DEFAULTS);
  mockGetNotificationEmailAddresses.mockReset();
  mockGetNotificationEmailAddresses.mockResolvedValue(["admin@example.com"]);
});

describe("sendInquiryCustomerReplyAdminEmail() の配信ゲート", () => {
  test("notifyInquiryCustomerReply が false なら sendEmail を呼ばず disabled を返す", async () => {
    mockGetEmailDeliverySettings.mockResolvedValue({
      ...DELIVERY_DEFAULTS,
      notifyInquiryCustomerReply: false,
    });

    const result = await sendInquiryCustomerReplyAdminEmail(DATA);

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("通知先アドレスが空なら sendEmail を呼ばず disabled を返す", async () => {
    mockGetNotificationEmailAddresses.mockResolvedValue([]);

    const result = await sendInquiryCustomerReplyAdminEmail(DATA);

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("notifyInquiryCustomerReply true かつ宛先ありなら sendEmail を呼ぶ", async () => {
    await sendInquiryCustomerReplyAdminEmail(DATA);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
