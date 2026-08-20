import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { AsyncOnlyStripe } from "@/shared/lib/stripe";

const mockCheckoutSessionExpire = mock<(sessionId: string) => Promise<void>>(
  () => Promise.resolve(),
);
const mockCheckoutSessionRetrieve = mock<
  (sessionId: string) => Promise<{ status: string }>
>(() => Promise.resolve({ status: "expired" }));
const mockGetStripeClient = mock(() => ({
  client: {
    checkout: {
      sessions: {
        expire: mockCheckoutSessionExpire,
        retrieve: mockCheckoutSessionRetrieve,
      },
    },
  },
}));

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
  ErrorSeverity: { LOW: "LOW", MEDIUM: "MEDIUM" },
}));

const {
  expireCheckoutSessionWithClientBestEffort,
  expireOpenCheckoutSessionBestEffort,
  retrieveCheckoutSessionStatus,
} = await import("@/shared/domain/payment/checkout-session-expiry");

describe("checkout-session-expiry kernel", () => {
  beforeEach(() => {
    mockCheckoutSessionExpire.mockReset();
    mockCheckoutSessionExpire.mockResolvedValue(undefined);
    mockCheckoutSessionRetrieve.mockReset();
    mockCheckoutSessionRetrieve.mockResolvedValue({ status: "expired" });
  });

  test("retrieveCheckoutSessionStatus returns Stripe session status", async () => {
    await expect(retrieveCheckoutSessionStatus("cs_test_1")).resolves.toBe(
      "expired",
    );
    expect(mockCheckoutSessionRetrieve).toHaveBeenCalledWith("cs_test_1");
  });

  test("expireOpenCheckoutSessionBestEffort expires via shared client", async () => {
    await expireOpenCheckoutSessionBestEffort({
      sessionId: "cs_test_2",
      context: { registrationId: "reg-1" },
    });
    expect(mockCheckoutSessionExpire).toHaveBeenCalledWith("cs_test_2");
  });

  test("expireCheckoutSessionWithClientBestEffort swallows Stripe rejections", async () => {
    mockCheckoutSessionExpire.mockRejectedValue(new Error("already expired"));
    const client = {
      checkout: { sessions: { expire: mockCheckoutSessionExpire } },
    } as unknown as AsyncOnlyStripe; // test-double: Stripe client surface only

    await expect(
      expireCheckoutSessionWithClientBestEffort({
        client,
        sessionId: "cs_test_3",
        operation: "createEventCheckoutSessionExpire",
        context: { registrationId: "reg-1" },
      }),
    ).resolves.toBeUndefined();
  });
});
