/**
 * お問い合わせ確認メールの memberInquiryUrl 出し分けテスト
 *
 * sendContactConfirmationEmail() は ContactEmailData.customerId（送信時点で
 * ログインしていた場合の Customer.id、submitInquiry action がセッションから
 * 解決した値のみを渡す）があるときだけ「マイページで確認する」リンクを含める。
 * resolveOrCreateGuestInquiryCustomer が事後に発行するゲスト shell の
 * customerId とは異なる値であることに注意（ここでは常にログイン起因のみ）。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockSendEmail = mock<
  (...args: unknown[]) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));
mock.module("@/shared/lib/email/send", () => ({ sendEmail: mockSendEmail }));

mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: mock(() =>
    Promise.resolve({ notifyNewInquiry: true }),
  ),
  getNotificationEmailAddresses: mock(() =>
    Promise.resolve(["admin@example.com"]),
  ),
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

type MemberUrlProps = { memberInquiryUrl?: string };
const mockContactConfirmationEmail = mock((props: MemberUrlProps) => props);
mock.module("@/shared/emails/contact-confirmation", () => ({
  ContactConfirmationEmail: mockContactConfirmationEmail,
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { sendContactConfirmationEmail } from "@/shared/lib/email/contact-emails";
import type { ContactEmailData } from "@/shared/lib/email/types";

const DATA: ContactEmailData = {
  inquiryId: "inquiry-abcdef123456",
  name: "山田太郎",
  email: "customer@example.com",
  subject: "テストの件",
  message: "お問い合わせ本文",
};

const MEMBER_URL_PATTERN = /\/mypage\/inquiries\/inquiry-abcdef123456$/;

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockContactConfirmationEmail.mockClear();
});

describe("sendContactConfirmationEmail() の memberInquiryUrl 出し分け", () => {
  test("ログイン中の送信（customerId あり）は memberInquiryUrl を発行する", async () => {
    await sendContactConfirmationEmail({ ...DATA, customerId: "customer-1" });

    const props = mockContactConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberInquiryUrl).toMatch(MEMBER_URL_PATTERN);
  });

  test("ゲスト送信（customerId なし）は memberInquiryUrl を発行しない", async () => {
    await sendContactConfirmationEmail({ ...DATA, customerId: null });

    const props = mockContactConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberInquiryUrl).toBeUndefined();
  });

  test("customerId 未指定でも memberInquiryUrl を発行しない", async () => {
    await sendContactConfirmationEmail(DATA);

    const props = mockContactConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberInquiryUrl).toBeUndefined();
  });
});
