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

// getResendClient は「webhooks.verify が payload を JSON.parse して返すだけ」の
// 偽装クライアントを返す。svix 署名検証そのものは本 PR のスコープ外
// （PR-J2 で decouple 予定）。
type FakeResend = {
  webhooks: {
    verify: (args: {
      payload: string;
      headers: Record<string, string>;
      webhookSecret: string;
    }) => unknown;
  };
};

let verifyImpl: FakeResend["webhooks"]["verify"] = ({ payload }) =>
  JSON.parse(payload);

const mockGetResendClient = mock<() => Promise<FakeResend>>(() =>
  Promise.resolve({
    webhooks: {
      verify: (args) => verifyImpl(args),
    },
  } satisfies FakeResend),
);

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

mock.module("@/shared/lib/email/client", () => ({
  getResendClient: mockGetResendClient,
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
  mockGetResendClient.mockClear();
  mockUpdateCustomerEmailDeliveryStatusByEmail.mockClear();
  mockInvalidateSiteWide.mockClear();
  invalidateCalls.length = 0;
  updateImpl = async () => 1;
  verifyImpl = ({ payload }) => JSON.parse(payload);
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
    expect(mockGetResendClient).not.toHaveBeenCalled();
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

    // b@example.com は必ず処理されている（loop が中断されていない）。
    expect(processed).toEqual(["b@example.com"]);
    // Resend 再配信を促す（domain 側 notIn 保護節が成功済み recipient を no-op にする）。
    expect(response.status).toBe(500);
    // 2 件呼ばれている（1 件目の throw は catch されて 2 件目に進んでいる）。
    expect(mockUpdateCustomerEmailDeliveryStatusByEmail).toHaveBeenCalledTimes(
      2,
    );
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
    expect(mockInvalidateSiteWide).toHaveBeenCalled();
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
    expect(mockGetResendClient).not.toHaveBeenCalled();
  });
});
