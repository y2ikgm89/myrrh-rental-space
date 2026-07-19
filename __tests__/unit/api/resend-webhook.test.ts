import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockGetResendClient = mock(async () => null);
const mockUpdateCustomerEmailDeliveryStatusByEmail = mock(async () => 0);

// 境界 mock: route.ts が使う唯一の cache-invalidation entry point を差し替える。
// `next/cache` を直 mock すると新規 export 追加ごとに追随が必要 (PR #945 fixup で
// 13 test file の名前ズレを一括修正した反省)。boundary mock なら site-wide.ts の
// 内部で使う revalidateTag / updateTag / expire オプション等が変わっても影響 0。
mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCacheFromRouteHandler: mock(() => undefined),
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

const { POST } = await import("@/app/api/webhooks/resend/route");

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

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    mockGetResendClient.mockClear();
    mockUpdateCustomerEmailDeliveryStatusByEmail.mockClear();
    mockServerEnv.RESEND_WEBHOOK_SECRET = "whsec_test";
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
