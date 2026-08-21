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

const mockCreateNotificationCommand = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mockCreateNotificationCommand,
}));

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
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";

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
    loadRefundedSoFar: async () => 0,
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
    mockCreateNotificationCommand.mockReset();
    mockSettingsCommerceFindUnique.mockResolvedValue(null);
    mockExecuteRefund.mockResolvedValue({
      refundAmount: 5000,
      cumulativeAmount: 5000,
      newPaymentStatus: "REFUNDED",
    });
  });

  test("既存の部分返金がある場合、ポリシーの取り分から差し引いて請求する", async () => {
    // 監査 F-43。総額 5000 / 既返金 2000 / ポリシー 100% なら、返すのは残り 3000。
    // 5000 を請求すると `resolveRefundAmount` が残額超過で reject し、
    // **キャンセル分の返金が 1 円も走らない**（旧実装の挙動）。
    mockSettingsCommerceFindUnique.mockResolvedValue({
      refundPolicy: {
        tiers: [{ hoursBefore: 0, refundRate: 100 }],
        defaultRefundRate: 100,
      },
    });

    const outcome = await runAutoRefundOnCancel(
      baseInput({ loadRefundedSoFar: async () => 2000 }),
    );

    expect(outcome.status).toBe("ok");
    expect(mockExecuteRefund).toHaveBeenCalledTimes(1);
    expect(mockExecuteRefund.mock.calls[0]?.[0]).toMatchObject({
      amount: 3000,
    });
  });

  test("ポリシー 50% で既に 50% 返金済みなら skip する", async () => {
    // 旧実装は 2500 を請求して通し、累計 5000（100%）＝ ポリシーの倍を返していた。
    mockSettingsCommerceFindUnique.mockResolvedValue({
      refundPolicy: {
        tiers: [{ hoursBefore: 0, refundRate: 50 }],
        defaultRefundRate: 50,
      },
    });

    const outcome = await runAutoRefundOnCancel(
      baseInput({ loadRefundedSoFar: async () => 2500 }),
    );

    expect(outcome).toEqual({
      status: "skipped",
      reason: AUTO_REFUND_SKIP_REASON.POLICY_ALREADY_SATISFIED,
      detail: { policyEntitlement: 2500, refundedSoFar: 2500 },
    });
    expect(mockExecuteRefund).not.toHaveBeenCalled();
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

  test("invalid policy → policyInvalid skip + logError + admin notification", async () => {
    mockSettingsCommerceFindUnique.mockResolvedValue({
      refundPolicy: { tiers: "broken", defaultRefundRate: 0 },
    });

    const outcome = await runAutoRefundOnCancel(baseInput());

    expect(outcome.status).toBe("skipped");
    expect(outcome.reason).toBe(AUTO_REFUND_SKIP_REASON.POLICY_INVALID);
    expect(mockExecuteRefund).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockCreateNotificationCommand).toHaveBeenCalledWith({
      type: NOTIFICATION_TYPE.REFUND_POLICY_INVALID,
      title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.REFUND_POLICY_INVALID],
      message: expect.stringContaining(ENTITY_ID),
      resourceId: ENTITY_ID,
    });
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
      detail: { policyEntitlement: 0, refundedSoFar: 0 },
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
