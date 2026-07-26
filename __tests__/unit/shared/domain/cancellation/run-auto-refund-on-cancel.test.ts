/**
 * runAutoRefundOnCancel — キャンセル時 auto-refund 共通カーネルの単体テスト。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockSettingsCommerceFindUnique = mock<
  (args: Record<string, unknown>) => Promise<{ refundPolicy: unknown } | null>
>(() => Promise.resolve(null));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settingsCommerce: { findUnique: mockSettingsCommerceFindUnique },
  },
}));

const mockExecuteRefund = mock<
  (args: {
    amount?: number;
    request: { ip: string | null; userAgent: string | null };
  }) => Promise<{
    refundAmount: number;
    cumulativeAmount: number;
    newPaymentStatus: string;
  }>
>(() =>
  Promise.resolve({
    refundAmount: 5000,
    cumulativeAmount: 5000,
    newPaymentStatus: "REFUNDED",
  }),
);

const mockLogError = mock<(err: unknown, ctx: unknown) => void>(() => {});

mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (err: unknown) =>
    err instanceof Error ? err : new Error(String(err)),
  ErrorCategory: {
    DATABASE: "DATABASE",
    EXTERNAL_API: "EXTERNAL_API",
  },
  ErrorSeverity: {
    LOW: "LOW",
    HIGH: "HIGH",
  },
}));

import {
  AUTO_REFUND_SKIP_REASON,
  runAutoRefundOnCancel,
} from "@/shared/domain/cancellation/run-auto-refund-on-cancel";

const ENTITY_ID = "ent-001";
const START_TIME = new Date("2099-01-01T10:00:00Z");
const REQUEST = { ip: "203.0.113.1", userAgent: "test-agent" };

function baseInput(
  overrides: Partial<Parameters<typeof runAutoRefundOnCancel>[0]> = {},
) {
  return {
    entityId: ENTITY_ID,
    operation: "autoRefundOnCancel",
    wasPaid: true,
    requiresRefund: true,
    chargeBase: 5000,
    startTime: START_TIME,
    request: REQUEST,
    executeRefund: mockExecuteRefund,
    ...overrides,
  };
}

describe("runAutoRefundOnCancel", () => {
  beforeEach(() => {
    mockSettingsCommerceFindUnique.mockReset();
    mockExecuteRefund.mockReset();
    mockLogError.mockReset();
    mockSettingsCommerceFindUnique.mockResolvedValue(null);
    mockExecuteRefund.mockResolvedValue({
      refundAmount: 5000,
      cumulativeAmount: 5000,
      newPaymentStatus: "REFUNDED",
    });
  });

  test("requiresRefund=false × wasPaid=false → notPaid skip", async () => {
    const outcome = await runAutoRefundOnCancel(
      baseInput({ wasPaid: false, requiresRefund: false }),
    );
    expect(outcome).toEqual({
      status: "skipped",
      reason: AUTO_REFUND_SKIP_REASON.NOT_PAID,
    });
    expect(mockExecuteRefund).not.toHaveBeenCalled();
  });

  test("requiresRefund=false × wasPaid=true → noPaymentIntent skip", async () => {
    const outcome = await runAutoRefundOnCancel(
      baseInput({ wasPaid: true, requiresRefund: false }),
    );
    expect(outcome).toEqual({
      status: "skipped",
      reason: AUTO_REFUND_SKIP_REASON.NO_PAYMENT_INTENT,
    });
    expect(mockExecuteRefund).not.toHaveBeenCalled();
  });

  test("invalid policy → policyInvalid skip + logError", async () => {
    mockSettingsCommerceFindUnique.mockResolvedValue({
      refundPolicy: { tiers: "broken", defaultRefundRate: 0 },
    });

    const outcome = await runAutoRefundOnCancel(baseInput());

    expect(outcome.status).toBe("skipped");
    expect(outcome.reason).toBe(AUTO_REFUND_SKIP_REASON.POLICY_INVALID);
    expect(mockExecuteRefund).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("policy refundRate=0% → policyRefundRateZero skip", async () => {
    mockSettingsCommerceFindUnique.mockResolvedValue({
      refundPolicy: {
        tiers: [{ hoursBefore: 24, refundRate: 100 }],
        defaultRefundRate: 0,
      },
    });

    const outcome = await runAutoRefundOnCancel(
      baseInput({
        startTime: new Date(Date.now() + 60 * 60 * 1000),
      }),
    );

    expect(outcome).toMatchObject({
      status: "skipped",
      reason: AUTO_REFUND_SKIP_REASON.POLICY_REFUND_RATE_ZERO,
      detail: { policyRefundAmount: 0 },
    });
    expect(mockExecuteRefund).not.toHaveBeenCalled();
  });

  test("unset policy → full remaining refund (amount 未指定)", async () => {
    const outcome = await runAutoRefundOnCancel(baseInput());

    expect(outcome.status).toBe("ok");
    expect(mockExecuteRefund).toHaveBeenCalledWith({
      request: REQUEST,
    });
  });

  test("configured policy 100% → amount 明示で refund", async () => {
    mockSettingsCommerceFindUnique.mockResolvedValue({
      refundPolicy: {
        tiers: [{ hoursBefore: 168, refundRate: 100 }],
        defaultRefundRate: 0,
      },
    });

    await runAutoRefundOnCancel(baseInput());

    expect(mockExecuteRefund).toHaveBeenCalledWith({
      amount: 5000,
      request: REQUEST,
    });
  });

  test("refundPolicySnapshot が渡されたら Settings fetch をスキップ", async () => {
    await runAutoRefundOnCancel(
      baseInput({
        refundPolicySnapshot: { status: "unset" },
      }),
    );

    expect(mockSettingsCommerceFindUnique).not.toHaveBeenCalled();
    expect(mockExecuteRefund).toHaveBeenCalledTimes(1);
  });

  test("executeRefund throw → error outcome", async () => {
    mockExecuteRefund.mockRejectedValue(new Error("stripe down"));

    const outcome = await runAutoRefundOnCancel(baseInput());

    expect(outcome).toMatchObject({
      status: "error",
      reason: "stripe down",
    });
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });
});
