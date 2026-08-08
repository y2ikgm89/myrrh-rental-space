/**
 * sendWelcomeEmail() の idempotencyKey drift gate。
 *
 * Resend の idempotency key は 24h 有効・同一キー再送で payload 差異があると 409
 * (`invalid_idempotent_request`) を返す。この 409 は `RETRYABLE_ERROR_NAMES`
 * (`send.ts`) に含まれないため、silent drop に近い挙動になる。
 *
 * 旧実装は `welcome/<sha256(customerEmail)>` を key にしていたため、顧客が
 * delete-account → 24h 内に同じメールアドレスで re-signup すると、payload
 * (customerName / freshly-issued loginUrl 等) が異なるまま同一キーで送信され、
 * 新規登録の welcome メールが silent drop していた（RESEND-AUDIT L5）。
 *
 * この drift gate は以下を強制する:
 * - idempotencyKey は `welcome/<customerId>` 形式（email hash を含まない）
 * - 同一メールアドレス・異なる customerId → 異なるキー（unique constraint 上は
 *   起きえないが code-level property として保証）
 * - 同一 customerId → 同一キー（Resend retry 冪等性）
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

type CapturedSendEmailParams = { idempotencyKey?: string };

const mockSendEmail = mock<
  (params: CapturedSendEmailParams) => Promise<{ ok: true; messageId: string }>
>(() => Promise.resolve({ ok: true, messageId: "msg_test" }));

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  // hashForKey は新実装では未使用だが、共存する他 sender の import 経路を
  // 壊さないように mock でも export しておく。
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

// WelcomeEmail react component 本体は key の観点では動作に無関係。
// mock で軽量化して JSX 評価コストを避ける。
mock.module("@/shared/emails/welcome", () => ({
  WelcomeEmail: () => null,
}));

import { EMAIL_SEND_CONTEXT } from "./_email-test-fixtures";

import { sendWelcomeEmail } from "@/shared/lib/email/welcome-emails";

function lastKey(): string | undefined {
  return mockSendEmail.mock.calls.at(-1)?.[0]?.idempotencyKey;
}

const BASE = {
  customerName: "山田太郎",
  customerEmail: "customer@example.com",
  loginUrl: "https://example.com/mypage",
} as const;

beforeEach(() => {
  mockSendEmail.mockReset();
  mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg_test" });
});

describe("sendWelcomeEmail() の idempotencyKey は customerId ベース", () => {
  test("キーは `welcome/<customerId>` 形式で email hash を含まない", async () => {
    const customerId = "cust_abcdef123456";
    await sendWelcomeEmail({ ...BASE, customerId }, EMAIL_SEND_CONTEXT);

    const key = lastKey();
    expect(key).toBe(`welcome/${customerId}`);
    // email 文字列そのものが key に含まれていないこと（hash 前後どちらも）
    expect(key).not.toContain(BASE.customerEmail);
    // 旧 `hashForKey(email)` = sha256 hex は 64 文字。key 長は
    // `welcome/` + uuid でそれよりずっと短くなる。email hash 混入の粗い検知。
    expect(key?.length ?? 0).toBeLessThan("welcome/".length + 64);
  });

  test("同一メールアドレス・異なる customerId → 異なるキー（delete-account → re-signup シナリオ）", async () => {
    // delete-account 前の旧 Customer
    await sendWelcomeEmail(
      { ...BASE, customerId: "cust_old" },
      EMAIL_SEND_CONTEXT,
    );
    const firstKey = lastKey();

    // 同じ email で 24h 内に再登録された新 Customer
    await sendWelcomeEmail(
      { ...BASE, customerId: "cust_new" },
      EMAIL_SEND_CONTEXT,
    );
    const secondKey = lastKey();

    expect(firstKey).toBeDefined();
    expect(secondKey).toBeDefined();
    expect(firstKey).not.toBe(secondKey);
  });

  test("同一 customerId → 同一キー（Resend retry 冪等性）", async () => {
    const customerId = "cust_retry_same";
    await sendWelcomeEmail({ ...BASE, customerId }, EMAIL_SEND_CONTEXT);
    const firstKey = lastKey();

    await sendWelcomeEmail({ ...BASE, customerId }, EMAIL_SEND_CONTEXT);
    const secondKey = lastKey();

    expect(firstKey).toBeDefined();
    expect(firstKey).toBe(secondKey);
  });
});
