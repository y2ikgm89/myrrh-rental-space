/**
 * `applyStripeChargeRefundIdempotent` の Refund.amount 永続化契約。
 *
 * USD $12.50 (=1250 cents) を Dashboard 返金すると fromStripeUnitAmount は 12.5 を
 * 返す。それを Int 列へ渡すと Prisma が throw → webhook 500 → 3 日再送になる。
 * persist helper が非整数を拒否し、handler は throw せず CRITICAL + 管理者通知する。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installErrorsServerMock } from "../../../mocks/errors-server";

mock.module("server-only", () => ({}));

const mockLogError = mock(() => undefined);
const mockCreateNotificationCommand = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());

await installErrorsServerMock({
  logError: mockLogError,
});

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: (input: Record<string, unknown>) =>
    mockCreateNotificationCommand(input),
}));

const { applyStripeChargeRefundIdempotent } =
  await import("@/shared/domain/payment/payment-claim-orchestration");

const { ErrorSeverity } = await import("@/shared/lib/errors/types");

describe("applyStripeChargeRefundIdempotent persist amount", () => {
  const createRefundRecord = mock(() => Promise.resolve());
  const updatePaymentStatus = mock(() => Promise.resolve());

  beforeEach(() => {
    createRefundRecord.mockClear();
    updatePaymentStatus.mockClear();
    mockLogError.mockClear();
    mockCreateNotificationCommand.mockClear();
  });

  test("JPY の整数最小単位は Refund 行を書く", async () => {
    await applyStripeChargeRefundIdempotent({
      chargeAmount: 5000,
      amountRefunded: 5000,
      currency: "jpy",
      latestRefund: {
        id: "re_jpy_int",
        amount: 5000,
        status: "succeeded",
        metadata: null,
      },
      createRefundRecord,
      updatePaymentStatus,
      logContext: {
        operation: "applyChargeRefundIdempotent",
        entityId: "res_1",
      },
    });

    expect(createRefundRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 5000,
        stripeRefundId: "re_jpy_int",
      }),
    );
    expect(updatePaymentStatus).toHaveBeenCalled();
  });

  test("USD 1250 cents は float を書かず throw もしない (CRITICAL + 管理者通知)", async () => {
    await applyStripeChargeRefundIdempotent({
      chargeAmount: 5000,
      amountRefunded: 1250,
      currency: "usd",
      latestRefund: {
        id: "re_usd_1250",
        amount: 1250,
        status: "succeeded",
        metadata: null,
      },
      createRefundRecord,
      updatePaymentStatus,
      logContext: {
        operation: "applyChargeRefundIdempotent",
        entityId: "res_1",
      },
    });

    expect(createRefundRecord).not.toHaveBeenCalled();
    expect(updatePaymentStatus).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledWith(
      expect.objectContaining({ name: "NonIntegerAppAmountError" }),
      expect.objectContaining({ severity: ErrorSeverity.CRITICAL }),
    );
    expect(mockCreateNotificationCommand).toHaveBeenCalled();
  });
});
