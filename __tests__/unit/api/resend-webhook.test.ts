import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockGetResendClient = mock(async () => null);
const mockUpdateCustomerEmailDeliveryStatusByEmail = mock(async () => 0);

mock.module("next/cache", () => ({
  revalidateTag: mock(() => undefined),
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
