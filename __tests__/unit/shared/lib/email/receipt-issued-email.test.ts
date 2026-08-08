/**
 * sendReceiptIssuedEmail() の CTA (`detailUrl`) 分岐と idempotencyKey drift gate。
 *
 * - CTA は呼出側が渡す `detailUrl` をそのまま使う（会員 mypage / ゲスト status）
 * - PDF API 直リンクや confirm-page DL URL を組み立てない
 * - idempotencyKey は静的 `receipt-issued/<serialNo>`（first-send-wins）
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

type ReceiptIssuedProps = {
  detailUrl?: string;
  serialNo?: string;
};
const mockReceiptIssuedEmail = mock((props: ReceiptIssuedProps) => props);
mock.module("@/shared/emails/receipt-issued", () => ({
  ReceiptIssuedEmail: mockReceiptIssuedEmail,
}));

import {
  ADMIN_DELIVERY,
  EMAIL_SEND_CONTEXT,
  INQUIRY_ADMIN_DELIVERY,
  RENDER_CONTEXT,
} from "./_email-test-fixtures";

import {
  buildReceiptIssuedIdempotencyKey,
  sendReceiptIssuedEmail,
} from "@/shared/lib/email/receipt-emails";

const BASE = {
  recipientEmail: "guest@example.com",
  serialNo: "2026-000042",
  recipientName: "山田 太郎",
  subject: "スペース利用料として",
  amount: 8800,
  taxAmount: 800,
  issuedAt: new Date("2026-07-26T00:00:00Z"),
} as const;

const MEMBER_DETAIL_URL =
  "https://example.com/mypage/reservations/res_member_001";
const GUEST_DETAIL_URL =
  "https://example.com/reservation/status?token=STATUS_TOKEN_PLACEHOLDER";

function lastCallProps(): ReceiptIssuedProps | undefined {
  return mockReceiptIssuedEmail.mock.calls.at(-1)?.[0];
}

function lastIdempotencyKey(): string | undefined {
  return mockSendEmail.mock.calls.at(-1)?.[0]?.idempotencyKey;
}

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockReceiptIssuedEmail.mockClear();
});

describe("sendReceiptIssuedEmail() の detailUrl CTA", () => {
  test("会員向け mypage URL を CTA に渡す", async () => {
    await sendReceiptIssuedEmail(
      {
        ...BASE,
        detailUrl: MEMBER_DETAIL_URL,
      },
      EMAIL_SEND_CONTEXT,
    );

    expect(lastCallProps()?.detailUrl).toBe(MEMBER_DETAIL_URL);
  });

  test("ゲスト向け status URL を CTA に渡す", async () => {
    await sendReceiptIssuedEmail(
      {
        ...BASE,
        detailUrl: GUEST_DETAIL_URL,
      },
      EMAIL_SEND_CONTEXT,
    );

    expect(lastCallProps()?.detailUrl).toBe(GUEST_DETAIL_URL);
  });

  test("PDF API / confirm-page DL 直リンクを組み立てない", async () => {
    await sendReceiptIssuedEmail(
      {
        ...BASE,
        detailUrl: MEMBER_DETAIL_URL,
      },
      EMAIL_SEND_CONTEXT,
    );

    const url = lastCallProps()?.detailUrl;
    expect(url).toBeDefined();
    expect(url).not.toMatch(/\/api\/receipts\//);
    expect(url).not.toMatch(/\/receipts\/[^/]+\/download/);
    expect(url).not.toMatch(/\/pdf\?token=/);
  });
});

describe("sendReceiptIssuedEmail() の idempotencyKey", () => {
  test("キーは `receipt-issued/<serialNo>` 形式（静的）", async () => {
    await sendReceiptIssuedEmail(
      {
        ...BASE,
        detailUrl: MEMBER_DETAIL_URL,
      },
      EMAIL_SEND_CONTEXT,
    );

    expect(lastIdempotencyKey()).toBe("receipt-issued/2026-000042");
    expect(lastIdempotencyKey()).toBe(
      buildReceiptIssuedIdempotencyKey(BASE.serialNo),
    );
  });

  test("同一 serialNo → 同一キー（first-send-wins / Resend retry 冪等）", async () => {
    await sendReceiptIssuedEmail(
      {
        ...BASE,
        detailUrl: MEMBER_DETAIL_URL,
      },
      EMAIL_SEND_CONTEXT,
    );
    const firstKey = lastIdempotencyKey();

    await sendReceiptIssuedEmail(
      {
        ...BASE,
        detailUrl: GUEST_DETAIL_URL,
      },
      EMAIL_SEND_CONTEXT,
    );
    const secondKey = lastIdempotencyKey();

    expect(firstKey).toBe("receipt-issued/2026-000042");
    expect(firstKey).toBe(secondKey);
  });

  test("異なる serialNo → 異なるキー", async () => {
    await sendReceiptIssuedEmail(
      {
        ...BASE,
        serialNo: "2026-000001",
        detailUrl: MEMBER_DETAIL_URL,
      },
      EMAIL_SEND_CONTEXT,
    );
    const firstKey = lastIdempotencyKey();

    await sendReceiptIssuedEmail(
      {
        ...BASE,
        serialNo: "2026-000002",
        detailUrl: MEMBER_DETAIL_URL,
      },
      EMAIL_SEND_CONTEXT,
    );
    const secondKey = lastIdempotencyKey();

    expect(firstKey).toBe("receipt-issued/2026-000001");
    expect(secondKey).toBe("receipt-issued/2026-000002");
    expect(firstKey).not.toBe(secondKey);
  });
});
