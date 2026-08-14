/**
 * handleRefundStatusUpdated — refund.updated / refund.failed webhook handler。
 *
 * konbini / customer_balance 等の非同期決済は `refunds.create()` 時点では
 * "pending" しか返さず、Stripe が最大45日かけて後日 "succeeded" または
 * "failed"/"canceled" を確定させる (refund.updated / refund.failed webhook)。
 * このハンドラは確定通知を受けて保留していた paymentStatus 反映を完了させる。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import type Stripe from "stripe";
import { installErrorsServerMock } from "../../../../mocks/errors-server";
import { REFUNDED_BY_TYPE } from "@/shared/lib/validations/enums/refund-attribution";

mock.module("server-only", () => ({}));

// serial-db-test-detection の real-DB 誤検出を避けるため明示的に mock する
// (`@/shared/db/prisma` を mock しないファイルは実 DB テストとして自動分類される)。
// handleRefundStatusUpdated は prisma を `applyConfirmedRefundStatus` の client 引数と
// してのみ transitively 使うが、その関数自体を下で mock するため中身は参照されない。
mock.module("@/shared/db/prisma", () => ({
  prisma: {},
}));

const RESERVATION_ID = "11111111-1111-4111-8111-111111111111";
const REGISTRATION_ID = "22222222-2222-4222-8222-222222222222";
const STRIPE_REFUND_ID = "re_test_123";

const mockFindRefundEntityByStripeRefundId = mock<
  (stripeRefundId: string) => Promise<{
    status: string;
    reservationId: string | null;
    eventRegistrationId: string | null;
    refundedByType: string;
  } | null>
>(() => Promise.resolve(null));
const mockApplyConfirmedRefundStatus = mock<
  (
    client: unknown,
    stripeRefundId: string,
    previousStatus: string,
    newStatus: string,
  ) => Promise<number>
>(() => Promise.resolve(1));

// isRefundSettledSuccess は分岐先の純関数。実装をそのまま複製する
// (mock すると呼び出し元の実際の判定と乖離するリスクがあるため)。
function isRefundSettledSuccess(status: string | null): boolean {
  return status === "succeeded";
}

mock.module("@/shared/domain/payment/stripe-refund-orchestration", () => ({
  findRefundEntityByStripeRefundId: (stripeRefundId: string) =>
    mockFindRefundEntityByStripeRefundId(stripeRefundId),
  applyConfirmedRefundStatus: (
    client: unknown,
    stripeRefundId: string,
    previousStatus: string,
    newStatus: string,
  ) =>
    mockApplyConfirmedRefundStatus(
      client,
      stripeRefundId,
      previousStatus,
      newStatus,
    ),
  isRefundSettledSuccess,
}));

const mockFinalizeSettledReservationRefund = mock<
  (
    reservationId: string,
    stripeRefundId: string,
    thisRefundAmount: number,
    refundedByType: string,
  ) => Promise<boolean>
>(() => Promise.resolve(true));
mock.module("@/shared/domain/reservations/payment-queries", () => ({
  finalizeSettledReservationRefund: (
    reservationId: string,
    stripeRefundId: string,
    thisRefundAmount: number,
    refundedByType: string,
  ) =>
    mockFinalizeSettledReservationRefund(
      reservationId,
      stripeRefundId,
      thisRefundAmount,
      refundedByType,
    ),
}));

const mockFinalizeSettledEventRegistrationRefund = mock<
  (
    registrationId: string,
    stripeRefundId: string,
    refundedByType: string,
  ) => Promise<boolean>
>(() => Promise.resolve(true));
mock.module("@/shared/domain/events/payment-queries", () => ({
  finalizeSettledEventRegistrationRefund: (
    registrationId: string,
    stripeRefundId: string,
    refundedByType: string,
  ) =>
    mockFinalizeSettledEventRegistrationRefund(
      registrationId,
      stripeRefundId,
      refundedByType,
    ),
}));

const mockInvalidateReservationCache = mock<(id: string) => void>(() => {});
const mockInvalidateEventRegistrationCache = mock<() => void>(() => {});
mock.module(
  "@/shared/domain/payment/stripe-webhook/cache-invalidation",
  () => ({
    invalidateReservationCache: (id: string) =>
      mockInvalidateReservationCache(id),
    invalidateEventRegistrationCache: () =>
      mockInvalidateEventRegistrationCache(),
  }),
);

const mockLogError = mock(() => undefined);
await installErrorsServerMock({
  logError: mockLogError,
});

const mockCreateNotificationCommand = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());
mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: (input: Record<string, unknown>) =>
    mockCreateNotificationCommand(input),
}));

const { handleRefundStatusUpdated } =
  await import("@/shared/domain/payment/stripe-webhook/refund-status-updated");

function buildRefund(overrides: Partial<Stripe.Refund> = {}): Stripe.Refund {
  return {
    id: STRIPE_REFUND_ID,
    object: "refund",
    amount: 5000,
    currency: "jpy",
    status: "succeeded",
    ...overrides,
  } as Stripe.Refund;
}

describe("handleRefundStatusUpdated", () => {
  beforeEach(() => {
    mockFindRefundEntityByStripeRefundId.mockReset();
    mockApplyConfirmedRefundStatus.mockReset();
    mockFinalizeSettledReservationRefund.mockReset();
    mockFinalizeSettledEventRegistrationRefund.mockReset();
    mockInvalidateReservationCache.mockClear();
    mockInvalidateEventRegistrationCache.mockClear();
    mockLogError.mockClear();
    mockCreateNotificationCommand.mockClear();

    mockApplyConfirmedRefundStatus.mockResolvedValue(1);
    mockFinalizeSettledReservationRefund.mockResolvedValue(true);
    mockFinalizeSettledEventRegistrationRefund.mockResolvedValue(true);
  });

  test("reservation 側: succeeded に確定すると finalizeSettledReservationRefund を呼びキャッシュを無効化する", async () => {
    mockFindRefundEntityByStripeRefundId.mockResolvedValueOnce({
      status: "pending",
      reservationId: RESERVATION_ID,
      eventRegistrationId: null,
      refundedByType: REFUNDED_BY_TYPE.ADMIN,
    });

    await handleRefundStatusUpdated(
      buildRefund({ status: "succeeded", amount: 3000 }),
    );

    // succeeded 側の Refund.status claim は finalize 自身が entity 反映と
    // atomic に行うため、handler はここで applyConfirmedRefundStatus を呼ばない
    // (Codex review, PR #1666)。
    expect(mockApplyConfirmedRefundStatus).not.toHaveBeenCalled();
    expect(mockFinalizeSettledReservationRefund).toHaveBeenCalledWith(
      RESERVATION_ID,
      STRIPE_REFUND_ID,
      3000,
      REFUNDED_BY_TYPE.ADMIN,
    );
    expect(mockInvalidateReservationCache).toHaveBeenCalledWith(RESERVATION_ID);
    expect(mockFinalizeSettledEventRegistrationRefund).not.toHaveBeenCalled();
    expect(mockInvalidateEventRegistrationCache).not.toHaveBeenCalled();
  });

  test("非ゼロ小数通貨 (usd) は Stripe 最小単位からアプリ単位に変換して finalize に渡す", async () => {
    mockFindRefundEntityByStripeRefundId.mockResolvedValueOnce({
      status: "pending",
      reservationId: RESERVATION_ID,
      eventRegistrationId: null,
      refundedByType: REFUNDED_BY_TYPE.ADMIN,
    });

    await handleRefundStatusUpdated(
      buildRefund({ status: "succeeded", amount: 5000, currency: "usd" }),
    );

    // 5000 セント → 50 ドル (fromStripeUnitAmount)。変換漏れは USD/EUR で
    // 返金完了メール等の金額を 100 倍に破損させる (Codex P2 #1, PR #1665)。
    expect(mockFinalizeSettledReservationRefund).toHaveBeenCalledWith(
      RESERVATION_ID,
      STRIPE_REFUND_ID,
      50,
      REFUNDED_BY_TYPE.ADMIN,
    );
  });

  test("USD $12.50 (=1250 cents) は finalize せず CRITICAL + 管理者通知して終わる", async () => {
    mockFindRefundEntityByStripeRefundId.mockResolvedValueOnce({
      status: "pending",
      reservationId: RESERVATION_ID,
      eventRegistrationId: null,
      refundedByType: REFUNDED_BY_TYPE.ADMIN,
    });

    await handleRefundStatusUpdated(
      buildRefund({ status: "succeeded", amount: 1250, currency: "usd" }),
    );

    expect(mockFinalizeSettledReservationRefund).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ name: "NonIntegerAppAmountError" }),
      expect.objectContaining({ severity: "CRITICAL" }),
    );
    expect(mockCreateNotificationCommand).toHaveBeenCalled();
  });

  test("event-registration 側: succeeded に確定すると finalizeSettledEventRegistrationRefund を呼びキャッシュを無効化する", async () => {
    mockFindRefundEntityByStripeRefundId.mockResolvedValueOnce({
      status: "pending",
      reservationId: null,
      eventRegistrationId: REGISTRATION_ID,
      refundedByType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
    });

    await handleRefundStatusUpdated(buildRefund({ status: "succeeded" }));

    expect(mockFinalizeSettledEventRegistrationRefund).toHaveBeenCalledWith(
      REGISTRATION_ID,
      STRIPE_REFUND_ID,
      REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
    );
    expect(mockInvalidateEventRegistrationCache).toHaveBeenCalledTimes(1);
    expect(mockFinalizeSettledReservationRefund).not.toHaveBeenCalled();
    expect(mockInvalidateReservationCache).not.toHaveBeenCalled();
  });

  test("既に同一 status (succeeded) で確定済みでも finalize は必ず呼ぶ (claim の権威は finalize 側にあるため)", async () => {
    // Refund.status の claim (非終端→succeeded) と entity 反映・完了 AuditLog は
    // finalize 関数自身が同一 tx で atomic に行う。handler 側の entity.status
    // スナップショットが既に "succeeded" と一致していても、finalize 自身の
    // claim (この test では default で count=1 = 未確定) が権威を持つため、
    // handler は常に finalize を呼ぶ (Codex review, PR #1666)。
    mockFindRefundEntityByStripeRefundId.mockResolvedValueOnce({
      status: "succeeded",
      reservationId: RESERVATION_ID,
      eventRegistrationId: null,
      refundedByType: REFUNDED_BY_TYPE.ADMIN,
    });

    await handleRefundStatusUpdated(buildRefund({ status: "succeeded" }));

    expect(mockApplyConfirmedRefundStatus).not.toHaveBeenCalled();
    expect(mockFinalizeSettledReservationRefund).toHaveBeenCalledWith(
      RESERVATION_ID,
      STRIPE_REFUND_ID,
      5000,
      REFUNDED_BY_TYPE.ADMIN,
    );
    expect(mockInvalidateReservationCache).toHaveBeenCalledWith(RESERVATION_ID);
  });

  test("refund.failed (status=failed) は status 列を更新し CRITICAL severity で logError する (paymentStatus は変更しない)", async () => {
    mockFindRefundEntityByStripeRefundId.mockResolvedValueOnce({
      status: "pending",
      reservationId: RESERVATION_ID,
      eventRegistrationId: null,
      refundedByType: REFUNDED_BY_TYPE.ADMIN,
    });

    await handleRefundStatusUpdated(buildRefund({ status: "failed" }));

    expect(mockApplyConfirmedRefundStatus).toHaveBeenCalledWith(
      expect.anything(),
      STRIPE_REFUND_ID,
      "pending",
      "failed",
    );
    expect(mockFinalizeSettledReservationRefund).not.toHaveBeenCalled();
    expect(mockInvalidateReservationCache).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ severity: "CRITICAL" }),
    );
  });

  test("status=canceled も status 列を更新し CRITICAL severity で logError する", async () => {
    mockFindRefundEntityByStripeRefundId.mockResolvedValueOnce({
      status: "pending",
      reservationId: RESERVATION_ID,
      eventRegistrationId: null,
      refundedByType: REFUNDED_BY_TYPE.ADMIN,
    });

    await handleRefundStatusUpdated(buildRefund({ status: "canceled" }));

    expect(mockApplyConfirmedRefundStatus).toHaveBeenCalledWith(
      expect.anything(),
      STRIPE_REFUND_ID,
      "pending",
      "canceled",
    );
    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ severity: "CRITICAL" }),
    );
    expect(mockFinalizeSettledReservationRefund).not.toHaveBeenCalled();
  });

  test("該当する Refund 行が見つからない場合は LOW severity で logError して終わる", async () => {
    mockFindRefundEntityByStripeRefundId.mockResolvedValueOnce(null);

    await handleRefundStatusUpdated(buildRefund({ status: "succeeded" }));

    expect(mockLogError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ severity: "LOW" }),
    );
    expect(mockApplyConfirmedRefundStatus).not.toHaveBeenCalled();
    expect(mockFinalizeSettledReservationRefund).not.toHaveBeenCalled();
  });

  test("status が pending/requires_action への遷移は中間状態として何もしない", async () => {
    mockFindRefundEntityByStripeRefundId.mockResolvedValueOnce({
      status: "requires_action",
      reservationId: RESERVATION_ID,
      eventRegistrationId: null,
      refundedByType: REFUNDED_BY_TYPE.ADMIN,
    });

    await handleRefundStatusUpdated(buildRefund({ status: "pending" }));

    expect(mockApplyConfirmedRefundStatus).toHaveBeenCalledWith(
      expect.anything(),
      STRIPE_REFUND_ID,
      "requires_action",
      "pending",
    );
    expect(mockFinalizeSettledReservationRefund).not.toHaveBeenCalled();
    expect(mockLogError).not.toHaveBeenCalled();
  });
});
