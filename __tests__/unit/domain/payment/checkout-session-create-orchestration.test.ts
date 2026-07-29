import { beforeEach, describe, expect, mock, test } from "bun:test";
import type Stripe from "stripe";
import type { AsyncOnlyStripe } from "@/shared/lib/stripe";

const mockCheckoutSessionCreate = mock<
  (
    params: Stripe.Checkout.SessionCreateParams,
    options: { idempotencyKey: string },
  ) => Promise<{ id: string; url: string | null }>
>(() =>
  Promise.resolve({ id: "cs_test_orchestration", url: "https://pay.test" }),
);

const mockSettleSession = mock<
  (sessionId: string) => Promise<{ settled: boolean }>
>(() => Promise.resolve({ settled: true }));
const mockRevertPending = mock<() => Promise<void>>(() =>
  Promise.resolve(undefined),
);
const mockRejectCheckoutSessionSettle = mock(() => Promise.resolve(undefined));
const mockHandleCheckoutSessionCreateFailure = mock(() =>
  Promise.resolve(undefined),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/domain/payment/checkout-session-expiry", () => ({
  expireOpenCheckoutSessionBestEffort: mock(() => Promise.resolve(undefined)),
}));
mock.module(
  "@/shared/domain/payment/checkout-session-write-orchestration",
  () => ({
    rejectCheckoutSessionSettle: mockRejectCheckoutSessionSettle,
    handleCheckoutSessionCreateFailure: mockHandleCheckoutSessionCreateFailure,
    revertCheckoutPendingToUnpaid: mock(() => Promise.resolve(undefined)),
  }),
);

const { orchestrateCheckoutSessionCreate } =
  await import("@/shared/domain/payment/checkout-session-create-orchestration");

describe("orchestrateCheckoutSessionCreate", () => {
  beforeEach(() => {
    mockCheckoutSessionCreate.mockReset();
    mockCheckoutSessionCreate.mockResolvedValue({
      id: "cs_test_orchestration",
      url: "https://pay.test",
    });
    mockSettleSession.mockReset();
    mockSettleSession.mockResolvedValue({ settled: true });
    mockRevertPending.mockReset();
    mockRejectCheckoutSessionSettle.mockReset();
    mockHandleCheckoutSessionCreateFailure.mockReset();
  });

  test("passes idempotencyKey to Stripe checkout.sessions.create", async () => {
    const client = {
      checkout: {
        sessions: {
          create: mockCheckoutSessionCreate,
        },
      },
    } as unknown as AsyncOnlyStripe;

    const idempotencyKey = "checkout/reservation/res-1/pending-claim";

    await orchestrateCheckoutSessionCreate({
      operation: "testCheckoutCreate",
      idempotencyKey,
      stripeContext: {
        client,
        currency: "jpy",
        paymentMethodTypes: ["card"],
        appUrl: "https://example.com",
      },
      buildSessionParams: () => ({
        mode: "payment",
        line_items: [],
      }),
      settleSession: mockSettleSession,
      revertPending: mockRevertPending,
      conflictMessage: "conflict",
      expireContext: { reservationId: "res-1" },
      buildSuccessResult: (session) => session,
    });

    expect(mockCheckoutSessionCreate).toHaveBeenCalledTimes(1);
    expect(mockCheckoutSessionCreate).toHaveBeenCalledWith(
      { mode: "payment", line_items: [] },
      { idempotencyKey },
    );
    expect(mockSettleSession).toHaveBeenCalledWith("cs_test_orchestration");
  });
});
