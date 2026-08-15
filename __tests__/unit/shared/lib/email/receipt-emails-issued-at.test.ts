/**
 * 領収書メールの発行日は他メールと同じ formatDateWithWeekday を使う (F-129)。
 *
 * formatJstDateString は集計・cron 用の machine 形式 "YYYY-MM-DD"。
 * 顧客向け本文にそれを流すと「発行日: 2026-07-26」になり、予約・イベント
 * メールの「2026年7月26日(日)」と揃わない。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

type CapturedSendEmailParams = { idempotencyKey?: string };
const mockSendEmail = mock<
  (params: CapturedSendEmailParams) => Promise<{ ok: true; messageId: string }>
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

mock.module("@/shared/lib/receipt-download-token", () => ({
  createReceiptDownloadToken: () => "TEST-TOKEN",
}));

type IssuedAtProps = { issuedAt?: string };
const mockReceiptIssuedEmail = mock((props: IssuedAtProps) => props);
mock.module("@/shared/emails/receipt-issued", () => ({
  ReceiptIssuedEmail: mockReceiptIssuedEmail,
}));

const mockReceiptResendEmail = mock((props: IssuedAtProps) => props);
mock.module("@/shared/emails/receipt-resend", () => ({
  ReceiptResendEmail: mockReceiptResendEmail,
}));

import { EMAIL_SEND_CONTEXT } from "./_email-test-fixtures";

import { formatDateWithWeekday } from "@/shared/lib/date-format";
import {
  sendReceiptIssuedEmail,
  sendReceiptResendEmail,
} from "@/shared/lib/email/receipt-emails";

const ISSUED_AT = new Date("2026-07-26T00:00:00Z");

const ISSUED_INPUT = {
  recipientEmail: "guest@example.com",
  serialNo: "2026-000042",
  recipientName: "山田 太郎",
  subject: "スペース利用料として",
  amount: 8800,
  taxAmount: 800,
  issuedAt: ISSUED_AT,
  detailUrl: "https://example.com/mypage/reservations/res_001",
};

const RESEND_INPUT = {
  recipientEmail: "guest@example.com",
  serialNo: "2026-000042",
  recipientName: "山田 太郎",
  subject: "スペース利用料として",
  amount: 8800,
  taxAmount: 800,
  issuedAt: ISSUED_AT,
};

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockReceiptIssuedEmail.mockClear();
  mockReceiptResendEmail.mockClear();
});

describe("領収書メールの issuedAt 表記 (F-129)", () => {
  test("sendReceiptIssuedEmail は formatDateWithWeekday を渡し YYYY-MM-DD にしない", async () => {
    await sendReceiptIssuedEmail(ISSUED_INPUT, EMAIL_SEND_CONTEXT);

    const issuedAt = mockReceiptIssuedEmail.mock.calls.at(-1)?.[0]?.issuedAt;
    expect(issuedAt).toBe(formatDateWithWeekday(ISSUED_AT));
    expect(issuedAt).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("sendReceiptResendEmail は formatDateWithWeekday を渡し YYYY-MM-DD にしない", async () => {
    await sendReceiptResendEmail(RESEND_INPUT, EMAIL_SEND_CONTEXT);

    const issuedAt = mockReceiptResendEmail.mock.calls.at(-1)?.[0]?.issuedAt;
    expect(issuedAt).toBe(formatDateWithWeekday(ISSUED_AT));
    expect(issuedAt).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
