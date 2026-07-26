import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockCheckoutSessionRetrieve = mock<
  (sessionId: string) => Promise<{ status: string }>
>(() => Promise.resolve({ status: "expired" }));
const mockGetStripeClient = mock(() =>
  Promise.resolve({
    client: {
      checkout: {
        sessions: {
          retrieve: mockCheckoutSessionRetrieve,
        },
      },
    },
  }),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/domain/payment/availability", () => ({
  assertStripeCredentialsConfigured: mock(() =>
    Promise.resolve({ stripeSecretKey: "enc-secret" }),
  ),
}));
mock.module("@/shared/lib/stripe", () => ({
  getStripeClient: () => mockGetStripeClient(),
}));
mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { LOW: "LOW" },
}));

const { retrieveCheckoutSessionStatus } =
  await import("@/shared/domain/payment/checkout-session-expiry");

describe("retrieveCheckoutSessionStatus", () => {
  beforeEach(() => {
    mockCheckoutSessionRetrieve.mockReset();
    mockCheckoutSessionRetrieve.mockResolvedValue({ status: "expired" });
  });

  test("returns Stripe session status", async () => {
    await expect(retrieveCheckoutSessionStatus("cs_test_1")).resolves.toBe(
      "expired",
    );
    expect(mockCheckoutSessionRetrieve).toHaveBeenCalledWith("cs_test_1");
  });
});
