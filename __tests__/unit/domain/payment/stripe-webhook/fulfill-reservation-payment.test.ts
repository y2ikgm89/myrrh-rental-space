/**
 * fulfillReservationPaymentAtomically — PENDING 決済完了時の smart-lock + 確認メール SSoT。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installErrorsServerMock } from "../../../../mocks/errors-server";

mock.module("server-only", () => ({}));

const RESERVATION_ID = "11111111-1111-4111-8111-111111111111";
const SPACE_ID = "22222222-2222-4222-8222-222222222222";
const START_TIME = new Date("2027-03-01T01:00:00.000Z");
const END_TIME = new Date("2027-03-01T03:00:00.000Z");

const mockClaimReservationAsPaid = mock<
  (
    id: string,
    data: { stripePaymentIntentId: string | null },
  ) => Promise<Record<string, unknown> | null>
>(async () => null);
const mockInvalidateReservationCache = mock(() => {});
const mockIssueReceiptForReservation = mock<
  (
    id: string,
    options?: { source?: string },
  ) => Promise<{ id: string; serialNo: string } | undefined>
>(async () => ({ id: "receipt-1", serialNo: "2027-000001" }));
const mockNotifyReceiptIssuedForReservation = mock(async () => ({ ok: true }));
const mockApplyConfirmationSideEffects = mock(async () => undefined);
const mockFireAndForget = mock((promise: Promise<unknown>) => promise);
const mockLogError = mock(() => {});

mock.module("@/shared/domain/reservations/payment-queries", () => ({
  claimReservationAsPaid: (
    id: string,
    data: { stripePaymentIntentId: string | null },
  ) => mockClaimReservationAsPaid(id, data),
}));

mock.module(
  "@/shared/domain/payment/stripe-webhook/cache-invalidation",
  () => ({
    invalidateReservationCache: (id: string) =>
      mockInvalidateReservationCache(id),
  }),
);

mock.module("@/shared/domain/receipts/issue", () => ({
  issueReceiptForReservation: (id: string, options?: { source?: string }) =>
    mockIssueReceiptForReservation(id, options),
}));

mock.module("@/shared/domain/receipts/notify-issued", () => ({
  notifyReceiptIssuedForReservation: (input: unknown) =>
    mockNotifyReceiptIssuedForReservation(input),
}));

mock.module("@/shared/domain/reservations/confirmation-side-effects", () => ({
  applyConfirmationSideEffects: (input: unknown) =>
    mockApplyConfirmationSideEffects(input),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => mockFireAndForget(promise),
}));

await installErrorsServerMock({
  logError: mockLogError,
  normalizeError: (err: unknown) =>
    err instanceof Error ? err : new Error(String(err)),
});

const { fulfillReservationPaymentAtomically } =
  await import("@/shared/domain/payment/stripe-webhook/fulfill-reservation-payment");

const baseReservation = {
  id: RESERVATION_ID,
  spaceId: SPACE_ID,
  startTime: START_TIME,
  endTime: END_TIME,
  totalPrice: 5000,
  notes: null,
  icsSequence: 1,
  userId: "user-1",
  guestEmail: null,
  status: "PENDING",
  customer: {
    email: "guest@example.com",
    lastName: "山田",
    firstName: "太郎",
  },
  space: {
    name: "Test Space",
    location: { name: "Tokyo" },
  },
};

describe("fulfillReservationPaymentAtomically", () => {
  beforeEach(() => {
    mockClaimReservationAsPaid.mockClear();
    mockInvalidateReservationCache.mockClear();
    mockIssueReceiptForReservation.mockClear();
    mockNotifyReceiptIssuedForReservation.mockClear();
    mockApplyConfirmationSideEffects.mockClear();
    mockFireAndForget.mockClear();
    mockLogError.mockClear();
    mockIssueReceiptForReservation.mockImplementation(async () => ({
      id: "receipt-1",
      serialNo: "2027-000001",
    }));
  });

  test("PENDING 決済完了時は applyConfirmationSideEffects を呼ぶ", async () => {
    mockClaimReservationAsPaid.mockResolvedValueOnce(baseReservation);

    await fulfillReservationPaymentAtomically(RESERVATION_ID, {
      payment_intent: "pi_test",
    } as import("stripe").Stripe.Checkout.Session);

    expect(mockApplyConfirmationSideEffects).toHaveBeenCalledWith({
      payload: expect.objectContaining({
        reservationId: RESERVATION_ID,
        customerEmail: "guest@example.com",
        icsSequence: 1,
      }),
      spaceId: SPACE_ID,
      channel: "customer",
    });
  });

  test("CONFIRMED 予約は確認メール SSoT を skip する", async () => {
    mockClaimReservationAsPaid.mockResolvedValueOnce({
      ...baseReservation,
      status: "CONFIRMED",
    });

    await fulfillReservationPaymentAtomically(RESERVATION_ID, {
      payment_intent: "pi_test",
    } as import("stripe").Stripe.Checkout.Session);

    expect(mockApplyConfirmationSideEffects).not.toHaveBeenCalled();
  });

  test("claim 失敗時は副作用を一切実行しない", async () => {
    mockClaimReservationAsPaid.mockResolvedValueOnce(null);

    await fulfillReservationPaymentAtomically(RESERVATION_ID, {
      payment_intent: "pi_test",
    } as import("stripe").Stripe.Checkout.Session);

    expect(mockApplyConfirmationSideEffects).not.toHaveBeenCalled();
    expect(mockIssueReceiptForReservation).not.toHaveBeenCalled();
  });
});
