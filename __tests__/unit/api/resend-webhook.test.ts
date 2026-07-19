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

// route.ts は毎回 `serverEnv.RESEND_WEBHOOK_SECRET` を property access で読むため、
// mutable object にしておくとテスト毎に override / 復元できる。
const mockServerEnv: { RESEND_WEBHOOK_SECRET?: string | undefined } = {
  RESEND_WEBHOOK_SECRET: "whsec_test",
};

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
}));

mock.module("@/shared/domain/customers/commands", () => ({
  updateCustomerEmailDeliveryStatusByEmail:
    mockUpdateCustomerEmailDeliveryStatusByEmail,
}));

// EmailDeliveryStatus enum の runtime 値を prisma-types gateway 経由で解決する。
mock.module("@/shared/lib/validations/enums/prisma-types", () => ({
  EmailDeliveryStatus,
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

function resetMocks() {
  mockUpdateCustomerEmailDeliveryStatusByEmail.mockClear();
  mockInvalidateSiteWide.mockClear();
  mockVerify.mockClear();
  invalidateCalls.length = 0;
  webhookConstructorCalls.length = 0;
  updateImpl = async () => 1;
  verifyImpl = (payload) => {
    const asString =
      typeof payload === "string" ? payload : payload.toString("utf8");
    return JSON.parse(asString);
  };
  mockServerEnv.RESEND_WEBHOOK_SECRET = "whsec_test";
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
  // L3: email.failed / email.suppressed handlers
  // -----------------------------------------------------------------

  test("L3: email.failed イベントは全 recipient を HARD_BOUNCED でマークする", async () => {
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
          reason: "domain refused connection",
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(applied).toEqual([
      {
        email: "a@example.com",
        status: EmailDeliveryStatus.HARD_BOUNCED,
        reason: "domain refused connection",
      },
      {
        email: "b@example.com",
        status: EmailDeliveryStatus.HARD_BOUNCED,
        reason: "domain refused connection",
      },
    ]);
    // cache invalidation が発火している（processed > 0）
    expect(mockInvalidateSiteWide).toHaveBeenCalled();
  });

  test("L3: email.failed で reason が data.failure.message にある場合も拾える", async () => {
    const applied: Array<{ reason: string | null }> = [];
    updateImpl = async (_email, _status, reason) => {
      applied.push({ reason });
      return 1;
    };

    await POST(
      makeSignedRequest({
        type: "email.failed",
        data: {
          to: ["a@example.com"],
          failure: { message: "smtp 550 mailbox does not exist" },
        },
      }),
    );

    expect(applied).toEqual([{ reason: "smtp 550 mailbox does not exist" }]);
  });

  test("L3: email.suppressed は HARD_BOUNCED + Resend suppression 文脈を reason に残す", async () => {
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
        },
      }),
    );

    expect(response.status).toBe(200);
    expect(applied).toEqual([
      {
        email: "c@example.com",
        status: EmailDeliveryStatus.HARD_BOUNCED,
        reason: "Blocked by Resend suppression list",
      },
    ]);
  });

  test("L3: email.suppressed で明示的 reason があればそれを優先する", async () => {
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
          reason: "recipient on account-level suppression list",
        },
      }),
    );

    expect(applied).toEqual([
      { reason: "recipient on account-level suppression list" },
    ]);
  });

  test("L3: email.failed で recipient の updateMany が throw しても loop は中断されない", async () => {
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
        },
      }),
    );

    // b@example.com は必ず処理されている（PR-J1 の per-recipient try/catch pattern と同じ）
    expect(processed).toEqual(["b@example.com"]);
    expect(response.status).toBe(200);
    expect(mockUpdateCustomerEmailDeliveryStatusByEmail).toHaveBeenCalledTimes(
      2,
    );
  });

  // H4 regression guard: RESEND_WEBHOOK_SECRET が Cloud Run env に配線されて
  // いないと `/api/webhooks/resend` が全リクエスト 503 になり、
  // bounce / complaint suppression が silent に壊れる (Gmail Feb 2024 /
  // Yahoo bulk sender の complaint-rate <0.3% 保護が非機能化)。
  // Terraform SSoT (runtime_secrets + cloud_run_secret_versions) が secret を
  // Cloud Run に注入し、serverEnv 経由でここに露出する契約を守る。
  test("RESEND_WEBHOOK_SECRET 未設定 → body を読まずに 503 を返す", async () => {
    delete mockServerEnv.RESEND_WEBHOOK_SECRET;
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
});
