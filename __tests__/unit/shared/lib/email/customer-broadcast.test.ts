/**
 * `sendCustomerBroadcast`（顧客一斉配信、Phase 4）のユニットテスト。
 *
 * domain が prefetch した recipients / excluded を lib に渡す前提。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

type SendEmailResult =
  { ok: true; messageId: string } | { ok: false; reason: string };
type CapturedSendEmailParams = {
  idempotencyKey?: string;
  operation: string;
  payload?: {
    headers?: Record<string, string>;
    react?: unknown;
  };
};

const mockSendEmail = mock<
  (params: CapturedSendEmailParams) => Promise<SendEmailResult>
>(() => Promise.resolve({ ok: true, messageId: "msg-1" }));
const mockGetEmailFooterData = mock<() => Promise<{ siteName: string }>>(() =>
  Promise.resolve({ siteName: "Myrrh" }),
);

mock.module("@/shared/lib/email/send", () => ({
  sendEmail: mockSendEmail,
  hashForKey: (value: string) => `hashed(${value})`,
}));
mock.module("@/shared/emails/_shared/footer-data", () => ({
  getEmailFooterData: mockGetEmailFooterData,
}));
mock.module("@/shared/lib/tokens/marketing-unsubscribe-token", () => ({
  createMarketingUnsubscribeArtifacts: (customerId: string) => ({
    url: `https://example.com/api/email/unsubscribe?token=${customerId}`,
    headers: {
      "List-Unsubscribe": `<https://example.com/api/email/unsubscribe?token=${customerId}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  }),
}));

import { EMAIL_SEND_CONTEXT } from "./_email-test-fixtures";

const { sendCustomerBroadcast } =
  await import("@/shared/lib/email/customer-emails");

const PARAMS = {
  subject: "お知らせ",
  body: "本文",
  broadcastNonce: "nonce-1",
};

describe("sendCustomerBroadcast", () => {
  beforeEach(() => {
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg-1" });
  });

  test("recipients が空なら送信0件で成功扱いにする", async () => {
    const result = await sendCustomerBroadcast(
      [],
      2,
      PARAMS,
      EMAIL_SEND_CONTEXT,
    );

    expect(result.ok).toBe(true);
    expect(result.sent).toBe(0);
    expect(result.excluded).toBe(2);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("送信成功件数を正しくカウントする", async () => {
    mockSendEmail
      .mockResolvedValueOnce({ ok: true, messageId: "m1" })
      .mockResolvedValueOnce({ ok: false, reason: "suppressed" });

    const result = await sendCustomerBroadcast(
      [
        { id: "c1", email: "a@example.com" },
        { id: "c2", email: "b@example.com" },
      ],
      0,
      { ...PARAMS, broadcastNonce: "nonce-3" },
      EMAIL_SEND_CONTEXT,
    );

    expect(result.sent).toBe(1);
    expect(result.excluded).toBe(0);
  });

  test("idempotencyKey が customer-broadcast/<customerId>/<hash>/<broadcastNonce> 形式になる", async () => {
    await sendCustomerBroadcast(
      [{ id: "c1", email: "a@example.com" }],
      0,
      { ...PARAMS, broadcastNonce: "nonce-4" },
      EMAIL_SEND_CONTEXT,
    );

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "customer-broadcast/c1/hashed(a@example.com)/nonce-4",
      }),
      EMAIL_SEND_CONTEXT,
    );
  });

  test("List-Unsubscribe ヘッダと本文用 URL を同一トークンで付与する", async () => {
    await sendCustomerBroadcast(
      [{ id: "c1", email: "a@example.com" }],
      0,
      { ...PARAMS, broadcastNonce: "nonce-5" },
      EMAIL_SEND_CONTEXT,
    );

    const call = mockSendEmail.mock.calls[0]?.[0];
    expect(call?.payload?.headers).toEqual({
      "List-Unsubscribe":
        "<https://example.com/api/email/unsubscribe?token=c1>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});
