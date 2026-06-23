/**
 * お問い合わせ管理者通知メールの配信ゲート（notifyNewInquiry / 通知先アドレス）テスト
 *
 * sendContactAdminNotification は以下の両方を満たすときだけ送信する:
 * - settings.notifyNewInquiry が true
 * - 通知先メールアドレスが 1 件以上
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

type DeliverySettings = {
  sendReservationConfirmationEmail: boolean;
  notifyNewReservation: boolean;
  notifyReservationChange: boolean;
  notifyReservationCancel: boolean;
  notifyNewInquiry: boolean;
  replyToEmail: string | null;
};

const DELIVERY_DEFAULTS: DeliverySettings = {
  sendReservationConfirmationEmail: true,
  notifyNewReservation: true,
  notifyReservationChange: true,
  notifyReservationCancel: true,
  notifyNewInquiry: true,
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
import { sendContactAdminNotification } from "@/shared/lib/email/contact-emails";
import type { ContactEmailData } from "@/shared/lib/email/types";

const DATA: ContactEmailData = {
  inquiryId: "inquiry-abcdef123456",
  name: "山田太郎",
  email: "customer@example.com",
  subject: "テストの件",
  message: "お問い合わせ本文",
};

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockGetEmailDeliverySettings.mockReset();
  mockGetEmailDeliverySettings.mockResolvedValue(DELIVERY_DEFAULTS);
  mockGetNotificationEmailAddresses.mockReset();
  mockGetNotificationEmailAddresses.mockResolvedValue(["admin@example.com"]);
});

describe("sendContactAdminNotification() の配信ゲート", () => {
  test("notifyNewInquiry が false なら sendEmail を呼ばず disabled を返す", async () => {
    mockGetEmailDeliverySettings.mockResolvedValue({
      ...DELIVERY_DEFAULTS,
      notifyNewInquiry: false,
    });

    const result = await sendContactAdminNotification(DATA);

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("通知先アドレスが空なら sendEmail を呼ばず disabled を返す", async () => {
    mockGetNotificationEmailAddresses.mockResolvedValue([]);

    const result = await sendContactAdminNotification(DATA);

    expect(result).toEqual({ ok: false, reason: "disabled" });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("notifyNewInquiry true かつ宛先ありなら sendEmail を呼ぶ", async () => {
    await sendContactAdminNotification(DATA);

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });
});
