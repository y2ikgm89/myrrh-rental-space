/**
 * sendReceiptResendEmail() の URL / idempotencyKey drift gate.
 *
 * 1. `receiptDownloadUrl` は guest confirm-page パス `/receipts/[serialNo]/download`
 *    を指すこと (HTTP-02 で GET `/api/receipts/[serialNo]/pdf` は
 *    Better-Auth session 経由のみに絞られ、ゲストは 404 になる)。
 *
 * 2. `idempotencyKey` は同一 serialNo + 同一 issuedAt でも呼び出しごとに変化する
 *    (Date.now() bucket を末尾に付与)。
 *    → 初回配信が Resend quarantine / 経路上の消失で届かなかった場合の正当な
 *      リトライで token 再暗号化により payload が変わっても 409
 *      (`invalid_idempotent_request`) が発生しない。abuse 対策は
 *      per-serial rate limiter が独立に担当する。
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

// createReceiptDownloadToken を決定的に固定 (URL 比較を安定化)
mock.module("@/shared/lib/receipt-download-token", () => ({
  createReceiptDownloadToken: () => "TEST-TOKEN",
}));

// ReceiptResendEmail を props 返却スパイに差し替え、payload.react の props を検査する
type ReceiptResendProps = {
  receiptDownloadUrl?: string;
  serialNo?: string;
};
const mockReceiptResendEmail = mock((props: ReceiptResendProps) => props);
mock.module("@/shared/emails/receipt-resend", () => ({
  ReceiptResendEmail: mockReceiptResendEmail,
}));

import {
  ADMIN_DELIVERY,
  EMAIL_SEND_CONTEXT,
  INQUIRY_ADMIN_DELIVERY,
  RENDER_CONTEXT,
} from "./_email-test-fixtures";

import { sendReceiptResendEmail } from "@/shared/lib/email/receipt-emails";

const INPUT = {
  recipientEmail: "guest@example.com",
  serialNo: "2026-000042",
  recipientName: "山田 太郎",
  subject: "スペース利用料として",
  amount: 8800,
  taxAmount: 800,
  issuedAt: new Date("2026-07-10T09:00:00Z"),
};

function lastCallProps(): ReceiptResendProps | undefined {
  return mockReceiptResendEmail.mock.calls.at(-1)?.[0];
}

function lastIdempotencyKey(): string | undefined {
  return mockSendEmail.mock.calls.at(-1)?.[0]?.idempotencyKey;
}

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
  mockReceiptResendEmail.mockClear();
});

describe("sendReceiptResendEmail() の receiptDownloadUrl", () => {
  test("guest 用 confirm-page パス `/receipts/[serialNo]/download?token=...` を指す (HTTP-02)", async () => {
    await sendReceiptResendEmail(INPUT, EMAIL_SEND_CONTEXT);

    const url = lastCallProps()?.receiptDownloadUrl;
    expect(url).toBeDefined();
    expect(url).toMatch(/\/receipts\/2026-000042\/download\?token=TEST-TOKEN$/);
  });

  test("deprecated な GET エンドポイント `/api/receipts/[serialNo]/pdf` を指さない", async () => {
    await sendReceiptResendEmail(INPUT, EMAIL_SEND_CONTEXT);

    const url = lastCallProps()?.receiptDownloadUrl;
    expect(url).toBeDefined();
    expect(url).not.toMatch(/\/api\/receipts\//);
    expect(url).not.toMatch(/\/pdf\?token=/);
  });
});

describe("sendReceiptResendEmail() の idempotencyKey", () => {
  test("同一 serialNo + 同一 issuedAt でも呼び出しごとに異なるキー (Date.now bucket)", async () => {
    await sendReceiptResendEmail(INPUT, EMAIL_SEND_CONTEXT);
    const firstKey = lastIdempotencyKey();

    // Date.now() は同一 tick では衝突しうるので、実時間を少しだけ進めてから再呼出
    await new Promise((resolve) => setTimeout(resolve, 5));

    await sendReceiptResendEmail(INPUT, EMAIL_SEND_CONTEXT);
    const secondKey = lastIdempotencyKey();

    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(firstKey).not.toBe(secondKey);
  });

  test("キーは `receipt-resend/<serialNo>/<issuedAtEpoch>/<nowEpoch>` 形式", async () => {
    await sendReceiptResendEmail(INPUT, EMAIL_SEND_CONTEXT);

    const key = lastIdempotencyKey();
    const expectedIssuedAtEpoch = INPUT.issuedAt.getTime();
    expect(key).toBeDefined();
    expect(key).toMatch(
      new RegExp(
        `^receipt-resend/2026-000042/${expectedIssuedAtEpoch}/\\d{10,}$`,
      ),
    );
  });
});
