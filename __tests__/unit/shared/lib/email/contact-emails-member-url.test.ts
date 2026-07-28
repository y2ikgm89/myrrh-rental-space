/**
 * お問い合わせ確認メールの memberInquiryUrl / privacyPolicyUrl 出し分けテスト
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

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

type MemberUrlProps = {
  memberInquiryUrl?: string;
  privacyPolicyUrl?: string;
};
const mockContactConfirmationEmail = mock((props: MemberUrlProps) => props);
mock.module("@/shared/emails/contact-confirmation", () => ({
  ContactConfirmationEmail: mockContactConfirmationEmail,
}));

import { EMAIL_SEND_CONTEXT } from "./_email-test-fixtures";
// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { sendContactConfirmationEmail } from "@/shared/lib/email/contact-emails";
import type { ContactEmailData } from "@/shared/lib/email/types";

const DATA: ContactEmailData = {
  inquiryId: "inquiry-abcdef123456",
  receiptNumber: "INQ-ABCDEF12",
  name: "山田太郎",
  email: "customer@example.com",
  subject: "テストの件",
  message: "お問い合わせ本文",
};

const MEMBER_URL_PATTERN = /\/mypage\/inquiries\/inquiry-abcdef123456$/;
const PRIVACY_POLICY_URL = "https://example.com/terms/privacy-policy";

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockContactConfirmationEmail.mockClear();
});

describe("sendContactConfirmationEmail() の memberInquiryUrl 出し分け", () => {
  test("ログイン中の送信（customerId あり）は memberInquiryUrl を発行する", async () => {
    await sendContactConfirmationEmail(
      { ...DATA, customerId: "customer-1" },
      {},
      EMAIL_SEND_CONTEXT,
    );

    const props = mockContactConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberInquiryUrl).toMatch(MEMBER_URL_PATTERN);
  });

  test("ゲスト送信（customerId なし）は memberInquiryUrl を発行しない", async () => {
    await sendContactConfirmationEmail(
      { ...DATA, customerId: null },
      {},
      EMAIL_SEND_CONTEXT,
    );

    const props = mockContactConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberInquiryUrl).toBeUndefined();
  });

  test("customerId 未指定でも memberInquiryUrl を発行しない", async () => {
    await sendContactConfirmationEmail(DATA, {}, EMAIL_SEND_CONTEXT);

    const props = mockContactConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.memberInquiryUrl).toBeUndefined();
  });
});

describe("sendContactConfirmationEmail() の privacyPolicyUrl 出し分け", () => {
  test("privacyPolicyUrl が renderContext にあれば本文に含める", async () => {
    await sendContactConfirmationEmail(
      DATA,
      { privacyPolicyUrl: PRIVACY_POLICY_URL },
      EMAIL_SEND_CONTEXT,
    );

    const props = mockContactConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.privacyPolicyUrl).toBe(PRIVACY_POLICY_URL);
  });

  test("privacyPolicyUrl が無ければ本文に含めない", async () => {
    await sendContactConfirmationEmail(DATA, {}, EMAIL_SEND_CONTEXT);

    const props = mockContactConfirmationEmail.mock.calls.at(-1)?.[0];
    expect(props?.privacyPolicyUrl).toBeUndefined();
  });
});
