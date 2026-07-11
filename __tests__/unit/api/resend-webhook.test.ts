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

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    RESEND_WEBHOOK_SECRET: "whsec_test",
  },
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

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    mockGetResendClient.mockClear();
    mockUpdateCustomerEmailDeliveryStatusByEmail.mockClear();
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
});
