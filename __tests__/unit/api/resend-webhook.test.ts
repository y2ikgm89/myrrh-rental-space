import { beforeEach, describe, expect, mock, test } from "bun:test";

// EmailDeliveryStatus 定数（本テストは prisma に届く前で assert する）。
const EmailDeliveryStatus = {
  OK: "OK",
  SOFT_BOUNCED: "SOFT_BOUNCED",
  HARD_BOUNCED: "HARD_BOUNCED",
  COMPLAINED: "COMPLAINED",
} as const;
type EmailDeliveryStatus =
  (typeof EmailDeliveryStatus)[keyof typeof EmailDeliveryStatus];

// -----------------------------------------------------------------------------
// Boundary mocks
// -----------------------------------------------------------------------------

// 個別 recipient への updateCustomerEmailDeliveryStatusByEmail 呼び出しを
// テストごとに差し替えるための reference。default は「1 件更新」に成功。
type UpdateFn = (
  email: string,
  status: EmailDeliveryStatus,
  reason: string | null,
) => Promise<number>;

let updateImpl: UpdateFn = async () => 1;

const mockUpdateCustomerEmailDeliveryStatusByEmail = mock<UpdateFn>(
  (email, status, reason) => updateImpl(email, status, reason),
);

// invalidateSiteWideCacheFromRouteHandler の呼び出しを捕捉する。
// L2 では tag 配列を assert する。
const invalidateCalls: Array<{
  tags: readonly string[];
  options?: { skipCdnPurge?: boolean };
}> = [];

const mockInvalidateSiteWide = mock<
  (
    tags: readonly string[],
    options?: { skipCdnPurge?: boolean },
  ) => void | Promise<void>
>((tags, options) => {
  invalidateCalls.push({ tags, ...(options ? { options } : {}) });
});

// M4: standardwebhooks の Webhook.verify を差し替えて payload を JSON.parse で返す
// 偽装実装にする。実 HMAC 検証は本 PR のスコープ外（署名 fixture 生成は runtime に依存）。
type VerifyFn = (
  payload: string | Buffer,
  headers: Record<string, string>,
) => unknown;

let verifyImpl: VerifyFn = (payload) => {
  const asString =
    typeof payload === "string" ? payload : payload.toString("utf8");
  return JSON.parse(asString);
};

const mockVerify = mock<VerifyFn>((payload, headers) =>
  verifyImpl(payload, headers),
);

// Webhook constructor 呼び出し回数の観測（secret 引数が渡されている事を assert）。
const webhookConstructorCalls: Array<{ secret: string | Uint8Array }> = [];

class MockWebhook {
  constructor(secret: string | Uint8Array) {
    webhookConstructorCalls.push({ secret });
  }
  verify(payload: string | Buffer, headers: Record<string, string>): unknown {
    return mockVerify(payload, headers);
  }
}

mock.module("standardwebhooks", () => ({
  Webhook: MockWebhook,
}));

mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCacheFromRouteHandler: mockInvalidateSiteWide,
}));

mock.module("next/navigation", () => ({
  unstable_rethrow: () => undefined,
}));

// route.ts は毎回 `getResendWebhookSecret()` を呼ぶため、mutable ref で
// テスト毎に override / 復元できるようにする (DB canonical + env fallback の
// 二段解決は resolver 側でカバーされるため、ここでは resolver 単位でモック)。
let resendWebhookSecretResolver: () => Promise<string | null> = async () =>
  "whsec_test";

mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getResendWebhookSecret: () => resendWebhookSecretResolver(),
}));

mock.module("@/shared/domain/customers/commands", () => ({
  updateCustomerEmailDeliveryStatusByEmail:
    mockUpdateCustomerEmailDeliveryStatusByEmail,
}));

// EmailDeliveryStatus enum の runtime 値を prisma-types gateway 経由で解決する。
mock.module("@/shared/lib/validations/enums/prisma-types", () => ({
  EmailDeliveryStatus,
}));

type LogErrorOptions = {
  category?: string;
  severity?: string;
  context?: Record<string, unknown>;
};
const mockLogError = mock<(error: unknown, options?: LogErrorOptions) => void>(
  () => undefined,
);

const actualErrors = await import("@/shared/lib/errors/server");
mock.module("@/shared/lib/errors/server", () => ({
  ...actualErrors,
  logError: (error: unknown, options?: LogErrorOptions) =>
    mockLogError(error, options),
}));

const { POST } = await import("@/app/api/webhooks/resend/route");

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function makeSignedRequest(payload: unknown): Request {
  const body = JSON.stringify(payload);
  return new Request("https://example.com/api/webhooks/resend", {
    method: "POST",
    headers: {
      "svix-id": "msg_test",
      "svix-timestamp": "1700000000",
      "svix-signature": "v1,fake",
      "content-type": "application/json",
    },
    body,
  });
}

function makeRequestWithoutSvixHeaders(onText: () => Promise<string>): Request {
  const request = new Request("https://example.com/api/webhooks/resend");
  Object.defineProperty(request, "text", { value: onText });
  return request;
}

function makeRequestWithSvixHeaders(onText: () => Promise<string>): Request {
  const request = new Request("https://example.com/api/webhooks/resend", {
    headers: {
      "svix-id": "msg_test",
      "svix-timestamp": "1700000000",
      "svix-signature": "v1,dGVzdA==",
    },
  });
  Object.defineProperty(request, "text", { value: onText });
  return request;
}

function expectNoSuppressionOnMultiRecipient(emailId: string | null) {
  expect(mockUpdateCustomerEmailDeliveryStatusByEmail).not.toHaveBeenCalled();
  expect(invalidateCalls).toHaveLength(0);
  const skipCalls = mockLogError.mock.calls.filter(([, options]) => {
    const context = options?.context;
    return (
      options?.category === "EXTERNAL_API" &&
      options?.severity === "MEDIUM" &&
      context?.recipientCount === 2 &&
      context?.emailId === emailId
    );
  });
  expect(skipCalls.length).toBeGreaterThanOrEqual(1);
  const context = skipCalls[0]?.[1]?.context;
  expect(context).toEqual({
    operation: expect.any(String),
    emailId,
    recipientCount: 2,
  });
}

function resetMocks() {
  mockUpdateCustomerEmailDeliveryStatusByEmail.mockClear();
  mockInvalidateSiteWide.mockClear();
  mockVerify.mockClear();
  mockLogError.mockClear();
  invalidateCalls.length = 0;
  webhookConstructorCalls.length = 0;
  updateImpl = async () => 1;
  verifyImpl = (payload) => {
    const asString =
      typeof payload === "string" ? payload : payload.toString("utf8");
    return JSON.parse(asString);
  };
  resendWebhookSecretResolver = async () => "whsec_test";
}

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    resetMocks();
  });

  test("svix headers がないリクエストは body を読まずに 400 を返す", async () => {
    const text = mock(async () => {
      throw new Error("body should not be read before svix header validation");
    });

    const response = await POST(makeRequestWithoutSvixHeaders(text));

    expect(response.status).toBe(400);
    expect(text).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  // -----------------------------------------------------------------
  // M4: signature verify を outbound API client と decouple
  // -----------------------------------------------------------------

  test("M4: getResendClient が null / 未 mock でも署名検証は成立する（env secret 直読み）", async () => {
    // getResendClient を明示 mock しない — route.ts が import しないことを
    // 前提とする本 PR の decoupling を fail-loud で保証する（もし import が
    // 残ればテスト実行時に unresolved module error になる）。
    updateImpl = async () => 1;

    const response = await POST(
      makeSignedRequest({
        type: "email.bounced",
        data: {
          email_id: "email_m4",
          to: ["a@example.com"],
          bounce: { type: "Permanent" },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(webhookConstructorCalls).toHaveLength(1);
    const call = webhookConstructorCalls[0];
    if (!call) throw new Error("expected Webhook constructor call");
    expect(call.secret).toBe("whsec_test");
    expect(mockVerify).toHaveBeenCalledTimes(1);
  });

  test("M4: standardwebhooks の verify が throw したら 400 を返し body は既に読了", async () => {
    verifyImpl = () => {
      throw new Error("No matching signature found");
    };

    const response = await POST(
      makeSignedRequest({
        type: "email.bounced",
        data: { to: ["x@example.com"] },
      }),
    );

    expect(response.status).toBe(400);
    // update は呼ばれない（署名検証で止まる）
    expect(mockUpdateCustomerEmailDeliveryStatusByEmail).not.toHaveBeenCalled();
  });

  test("M4: svix-* header は webhook-* にリマップして渡される（Standard Webhooks 準拠）", async () => {
    const capturedHeaders: Array<Record<string, string>> = [];
    verifyImpl = (payload, headers) => {
      capturedHeaders.push(headers);
      const asString =
        typeof payload === "string" ? payload : payload.toString("utf8");
      return JSON.parse(asString);
    };

    await POST(
      makeSignedRequest({
        type: "email.complained",
        data: { to: ["a@example.com"] },
      }),
    );

    expect(capturedHeaders).toHaveLength(1);
    expect(capturedHeaders[0]).toEqual({
      "webhook-id": "msg_test",
      "webhook-timestamp": "1700000000",
      "webhook-signature": "v1,fake",
    });
  });

  // -----------------------------------------------------------------
  // M2: BounceDetailsSchema の語彙拡張（Transient / Undetermined / unknown）
  // -----------------------------------------------------------------

  test("M2: bounce.type='Transient' は SOFT_BOUNCED としてマップされる", async () => {
    const applied: Array<{ email: string; status: EmailDeliveryStatus }> = [];
    updateImpl = async (email, status) => {
      applied.push({ email, status });
      return 1;
    };

    const response = await POST(
      makeSignedRequest({
        type: "email.bounced",
        data: {
          email_id: "email_1",
          to: ["a@example.com"],
          bounce: { type: "Transient", message: "mailbox full" },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(applied).toEqual([
      { email: "a@example.com", status: EmailDeliveryStatus.SOFT_BOUNCED },
    ]);
  });

  test("M2: bounce.type='Undetermined' は SOFT_BOUNCED としてマップされる", async () => {
    const applied: EmailDeliveryStatus[] = [];
    updateImpl = async (_email, status) => {
      applied.push(status);
      return 1;
    };

    const response = await POST(
      makeSignedRequest({
        type: "email.bounced",
        data: {
          email_id: "email_2",
          to: ["b@example.com"],
          bounce: { type: "Undetermined" },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(applied).toEqual([EmailDeliveryStatus.SOFT_BOUNCED]);
  });

  test("M2: 完全に未知の bounce.type は SOFT_BOUNCED 既定 + breadcrumb 用途で受理される", async () => {
    const applied: EmailDeliveryStatus[] = [];
    updateImpl = async (_email, status) => {
      applied.push(status);
      return 1;
    };

    // Zod parse で弾かれず handler に届くこと（旧実装はここで
    // safeParse.success=false → handled:false 200-ack の silent bug）。
    const response = await POST(
      makeSignedRequest({
        type: "email.bounced",
        data: {
          email_id: "email_3",
          to: ["c@example.com"],
          bounce: { type: "SomeFutureCategoryFromResend" },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(applied).toEqual([EmailDeliveryStatus.SOFT_BOUNCED]);
  });

  test("M2: bounce.type='Permanent' は引き続き HARD_BOUNCED", async () => {
    const applied: EmailDeliveryStatus[] = [];
    updateImpl = async (_email, status) => {
      applied.push(status);
      return 1;
    };

    const response = await POST(
      makeSignedRequest({
        type: "email.bounced",
        data: {
          email_id: "email_4",
          to: ["d@example.com"],
          bounce: { type: "Permanent" },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(applied).toEqual([EmailDeliveryStatus.HARD_BOUNCED]);
  });

  // -----------------------------------------------------------------
  // M3: recipient ごとのエラー分離
  // -----------------------------------------------------------------

  test("M3: 1 件目の recipient で Prisma が throw しても 2 件目は処理され、handler は 500 を返す", async () => {
    const processed: string[] = [];
    updateImpl = async (email) => {
      if (email === "a@example.com") {
        throw new Error("prisma pool exhausted");
      }
      processed.push(email);
      return 1;
    };

    const response = await POST(
      makeSignedRequest({
        type: "email.complained",
        data: {
          email_id: "email_5",
          to: ["a@example.com", "b@example.com"],
        },
      }),
    );

    // to.length !== 1 ではどの宛先が申告したか分からないので抑止しない。
    // throw する impl でも update に届かないため 200 ack。
    expect(processed).toEqual([]);
    expect(response.status).toBe(200);
    expectNoSuppressionOnMultiRecipient("email_5");
  });

  test("M3: 全 recipient が正常なら 200 を返し、cache invalidation が発火する", async () => {
    updateImpl = async () => 1;

    const response = await POST(
      makeSignedRequest({
        type: "email.complained",
        data: {
          to: ["a@example.com", "b@example.com"],
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockInvalidateSiteWide).not.toHaveBeenCalled();
    expectNoSuppressionOnMultiRecipient(null);
  });

  // -----------------------------------------------------------------
  // L2: SOFT_BOUNCED は SUPPRESSED_EMAILS を invalidate しない
  // -----------------------------------------------------------------

  test("L2: SOFT_BOUNCED イベントは CUSTOMERS のみ invalidate し SUPPRESSED_EMAILS は触らない", async () => {
    updateImpl = async () => 1;

    await POST(
      makeSignedRequest({
        type: "email.bounced",
        data: {
          to: ["a@example.com"],
          bounce: { type: "Transient" },
        },
      }),
    );

    expect(invalidateCalls).toHaveLength(1);
    const call = invalidateCalls[0];
    if (!call) throw new Error("expected invalidation call");
    // "customers" は含む
    expect(call.tags).toContain("customers");
    // "suppressed-emails" は含まない（SOFT_BOUNCED は suppression 対象外）
    expect(call.tags).not.toContain("suppressed-emails");
    // skipCdnPurge は保持されている。
    expect(call.options?.skipCdnPurge).toBe(true);
  });

  test("L2: HARD_BOUNCED イベントは CUSTOMERS + SUPPRESSED_EMAILS の両方を invalidate する", async () => {
    updateImpl = async () => 1;

    await POST(
      makeSignedRequest({
        type: "email.bounced",
        data: {
          to: ["a@example.com"],
          bounce: { type: "Permanent" },
        },
      }),
    );

    expect(invalidateCalls).toHaveLength(1);
    const call = invalidateCalls[0];
    if (!call) throw new Error("expected invalidation call");
    expect(call.tags).toContain("customers");
    expect(call.tags).toContain("suppressed-emails");
  });

  test("L2: COMPLAINED イベントは CUSTOMERS + SUPPRESSED_EMAILS の両方を invalidate する", async () => {
    updateImpl = async () => 1;

    await POST(
      makeSignedRequest({
        type: "email.complained",
        data: { to: ["a@example.com"] },
      }),
    );

    expect(invalidateCalls).toHaveLength(1);
    const call = invalidateCalls[0];
    if (!call) throw new Error("expected invalidation call");
    expect(call.tags).toContain("customers");
    expect(call.tags).toContain("suppressed-emails");
  });

  test("L2: processed=0（全 recipient が notIn 保護で no-op）なら invalidation は発火しない", async () => {
    updateImpl = async () => 0;

    await POST(
      makeSignedRequest({
        type: "email.complained",
        data: { to: ["a@example.com"] },
      }),
    );

    expect(invalidateCalls).toHaveLength(0);
  });

  // -----------------------------------------------------------------
  // L3: email.failed / email.suppressed handlers
  // Resend 公式: email.failed は invalid recipients / API key / domain /
  // quota 等で発火する。recipient 起因 (`invalid_recipient`) のみ
  // HARD_BOUNCED に載せ、送信側インフラ要因は抑止しない。
  // payload は公式形 `data.failed.reason` / `data.suppressed.{message,type}`。
  // -----------------------------------------------------------------

  test("L3: email.failed + failed.reason=invalid_recipient は HARD_BOUNCED", async () => {
    const applied: Array<{
      email: string;
      status: EmailDeliveryStatus;
      reason: string | null;
    }> = [];
    updateImpl = async (email, status, reason) => {
      applied.push({ email, status, reason });
      return 1;
    };

    const response = await POST(
      makeSignedRequest({
        type: "email.failed",
        data: {
          email_id: "email_failed_1",
          to: ["a@example.com", "b@example.com"],
          failed: { reason: "invalid_recipient" },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(applied).toEqual([]);
    expect(mockInvalidateSiteWide).not.toHaveBeenCalled();
    expectNoSuppressionOnMultiRecipient("email_failed_1");
  });

  test("L3: email.failed + reached_daily_quota は抑止せず 200 ack のみ", async () => {
    const response = await POST(
      makeSignedRequest({
        type: "email.failed",
        data: {
          email_id: "email_failed_quota",
          to: ["a@example.com", "b@example.com"],
          failed: { reason: "reached_daily_quota" },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateCustomerEmailDeliveryStatusByEmail).not.toHaveBeenCalled();
    expect(invalidateCalls).toHaveLength(0);
  });

  test("L3: email.failed の未知 reason / missing failed は抑止せず ack", async () => {
    const unknownReason = await POST(
      makeSignedRequest({
        type: "email.failed",
        data: {
          to: ["a@example.com"],
          failed: { reason: "some_future_sender_error" },
        },
      }),
    );
    expect(unknownReason.status).toBe(200);
    expect(mockUpdateCustomerEmailDeliveryStatusByEmail).not.toHaveBeenCalled();

    mockUpdateCustomerEmailDeliveryStatusByEmail.mockClear();

    const missingFailed = await POST(
      makeSignedRequest({
        type: "email.failed",
        data: { to: ["a@example.com"] },
      }),
    );
    expect(missingFailed.status).toBe(200);
    expect(mockUpdateCustomerEmailDeliveryStatusByEmail).not.toHaveBeenCalled();
  });

  test("L3: 旧非公式 payload (data.reason / data.failure) は抑止しない (clean break)", async () => {
    const response = await POST(
      makeSignedRequest({
        type: "email.failed",
        data: {
          to: ["a@example.com"],
          reason: "invalid_recipient",
          failure: { message: "smtp 550 mailbox does not exist" },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(mockUpdateCustomerEmailDeliveryStatusByEmail).not.toHaveBeenCalled();
  });

  test("L3: email.suppressed は HARD_BOUNCED + suppressed.message を reason に残す", async () => {
    const applied: Array<{
      email: string;
      status: EmailDeliveryStatus;
      reason: string | null;
    }> = [];
    updateImpl = async (email, status, reason) => {
      applied.push({ email, status, reason });
      return 1;
    };

    const response = await POST(
      makeSignedRequest({
        type: "email.suppressed",
        data: {
          email_id: "email_suppressed_1",
          to: ["c@example.com"],
          suppressed: {
            message:
              "Resend has suppressed sending to this address because it is on the account-level suppression list",
            type: "OnAccountSuppressionList",
          },
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(applied).toEqual([
      {
        email: "c@example.com",
        status: EmailDeliveryStatus.HARD_BOUNCED,
        reason:
          "Resend has suppressed sending to this address because it is on the account-level suppression list",
      },
    ]);
  });

  test("L3: email.suppressed で message が無いときは type / fallback を使う", async () => {
    const applied: Array<{ reason: string | null }> = [];
    updateImpl = async (_email, _status, reason) => {
      applied.push({ reason });
      return 1;
    };

    await POST(
      makeSignedRequest({
        type: "email.suppressed",
        data: {
          to: ["c@example.com"],
          suppressed: { type: "OnAccountSuppressionList" },
        },
      }),
    );

    expect(applied).toEqual([{ reason: "OnAccountSuppressionList" }]);

    applied.length = 0;
    await POST(
      makeSignedRequest({
        type: "email.suppressed",
        data: { to: ["d@example.com"] },
      }),
    );
    expect(applied).toEqual([{ reason: "Blocked by Resend suppression list" }]);
  });

  test("L3: email.failed (invalid_recipient) で update が throw しても loop は中断されない", async () => {
    const processed: string[] = [];
    updateImpl = async (email) => {
      if (email === "a@example.com") {
        throw new Error("prisma pool exhausted");
      }
      processed.push(email);
      return 1;
    };

    const response = await POST(
      makeSignedRequest({
        type: "email.failed",
        data: {
          to: ["a@example.com", "b@example.com"],
          failed: { reason: "invalid_recipient" },
        },
      }),
    );

    expect(processed).toEqual([]);
    expect(response.status).toBe(200);
    expectNoSuppressionOnMultiRecipient(null);
  });

  // H4 regression guard: DB (Settings.resendWebhookSecret canonical) にも
  // env (`RESEND_WEBHOOK_SECRET` local dev fallback) にも値が無いと
  // `/api/webhooks/resend` が全リクエスト 503 になり、bounce / complaint
  // suppression が silent に壊れる (Gmail Feb 2024 / Yahoo bulk sender の
  // complaint-rate <0.3% 保護が非機能化)。Tier 2 (DB canonical) 移行後は
  // resolver = `getResendWebhookSecret()` が両方の解決を包む。
  test("Resend webhook secret 未設定 (DB + env どちらも null) → body を読まずに 503 を返す", async () => {
    resendWebhookSecretResolver = async () => null;
    const text = mock(async () => {
      throw new Error("body should not be read when secret is missing");
    });

    const response = await POST(makeRequestWithSvixHeaders(text));
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(503);
    expect(body.error).toContain("not configured");
    expect(text).not.toHaveBeenCalled();
    expect(mockVerify).not.toHaveBeenCalled();
  });

  test("未知例外は 500 を返し Resend 再配信に任せる（M3 partial failure と同方針）", async () => {
    resendWebhookSecretResolver = async () => {
      throw new Error("database unavailable");
    };

    const response = await POST(
      makeSignedRequest({
        type: "email.bounced",
        data: { to: ["a@example.com"] },
      }),
    );
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).toContain("Internal error processing webhook");
    expect(mockVerify).not.toHaveBeenCalled();
  });
});
