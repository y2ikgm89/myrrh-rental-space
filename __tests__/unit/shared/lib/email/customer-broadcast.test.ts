/**
 * `sendCustomerBroadcast`（顧客一斉配信、Phase 4）のユニットテスト。
 *
 * `sendEventBroadcast` と同型の設計判断を検証する:
 * - 送信対象は指定された customerIds のうち `marketingOptIn: true` の顧客のみ
 *   （opt-out 顧客は同意ゲートとして送信対象から除外し excluded にカウント）
 * - 送信対象 0 件でも ok:true（UI は sent=0 で reflect）
 * - Promise.allSettled の個別成功/失敗を sent にカウントする
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

type BroadcastRecipient = { id: string; email: string };
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

const mockFindMany = mock<
  (customerIds: string[]) => Promise<BroadcastRecipient[]>
>(() => Promise.resolve([]));
const mockSendEmail = mock<
  (params: CapturedSendEmailParams) => Promise<SendEmailResult>
>(() => Promise.resolve({ ok: true, messageId: "msg-1" }));
const mockGetEmailFooterData = mock<() => Promise<{ siteName: string }>>(() =>
  Promise.resolve({ siteName: "Myrrh" }),
);

// `sendCustomerBroadcast` は DB query を `@/shared/domain/customers/queries` の
// `findCustomersForBroadcast` 経由で行う（architecture-boundaries.test.ts の
// placement gate により、shared/lib/email/* からの `@/shared/db/prisma` 直 import は
// event-emails.ts 等の既存 4 ファイルの allowlist に限定されており、新規ファイルを
// 追加ではなく domain/customers/queries.ts に切り出す方針を踏襲）。
mock.module("@/shared/domain/customers/queries", () => ({
  findCustomersForBroadcast: mockFindMany,
}));
// `sendCustomerBroadcast` は send.ts から `sendEmail` と `hashForKey` の両方を
// import する（event-emails.ts の実 import を確認して踏襲）。brief の元テストは
// `hashForKey` を mock していなかったため、実装後に `hashForKey is not a
// function` で誤った理由で fail する不具合があった — ここで修正済み。
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

const { sendCustomerBroadcast } =
  await import("@/shared/lib/email/customer-emails");

describe("sendCustomerBroadcast", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockSendEmail.mockReset();
    mockSendEmail.mockResolvedValue({ ok: true, messageId: "msg-1" });
  });

  test("marketingOptIn: false の顧客は送信対象から除外し excluded に計上する", async () => {
    mockFindMany.mockResolvedValue([{ id: "c1", email: "a@example.com" }]);

    const result = await sendCustomerBroadcast(["c1", "c2"], {
      subject: "お知らせ",
      body: "本文",
      broadcastNonce: "nonce-1",
    });

    expect(mockFindMany).toHaveBeenCalledWith(["c1", "c2"]);
    expect(result.sent).toBe(1);
    expect(result.excluded).toBe(1);
  });

  test("全員 opt-out の場合は送信0件・excluded=選択数で成功扱いにする", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await sendCustomerBroadcast(["c1", "c2"], {
      subject: "お知らせ",
      body: "本文",
      broadcastNonce: "nonce-2",
    });

    expect(result.ok).toBe(true);
    expect(result.sent).toBe(0);
    expect(result.excluded).toBe(2);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  test("送信成功件数を正しくカウントする", async () => {
    mockFindMany.mockResolvedValue([
      { id: "c1", email: "a@example.com" },
      { id: "c2", email: "b@example.com" },
    ]);
    mockSendEmail
      .mockResolvedValueOnce({ ok: true, messageId: "m1" })
      .mockResolvedValueOnce({ ok: false, reason: "suppressed" });

    const result = await sendCustomerBroadcast(["c1", "c2"], {
      subject: "お知らせ",
      body: "本文",
      broadcastNonce: "nonce-3",
    });

    expect(result.sent).toBe(1);
  });

  test("idempotencyKey が customer-broadcast/<customerId>/<hash>/<broadcastNonce> 形式になる", async () => {
    mockFindMany.mockResolvedValue([{ id: "c1", email: "a@example.com" }]);

    await sendCustomerBroadcast(["c1"], {
      subject: "お知らせ",
      body: "本文",
      broadcastNonce: "nonce-4",
    });

    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "customer-broadcast/c1/hashed(a@example.com)/nonce-4",
      }),
    );
  });

  test("List-Unsubscribe ヘッダと本文用 URL を同一トークンで付与する", async () => {
    mockFindMany.mockResolvedValue([{ id: "c1", email: "a@example.com" }]);

    await sendCustomerBroadcast(["c1"], {
      subject: "お知らせ",
      body: "本文",
      broadcastNonce: "nonce-5",
    });

    const call = mockSendEmail.mock.calls[0]?.[0];
    expect(call?.payload?.headers).toEqual({
      "List-Unsubscribe":
        "<https://example.com/api/email/unsubscribe?token=c1>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
  });
});
