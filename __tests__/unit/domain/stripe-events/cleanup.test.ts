import { describe, test, expect, beforeEach, mock } from "bun:test";

// STRIPE-DEDUP-B: /api/cron/stripe-event-cleanup が呼び出す domain 層。
// StripeEvent table の retention 削除と crash-recovery unblock を境界 mock で検証。

mock.module("server-only", () => ({}));

type DeleteManyArgs = {
  where: {
    receivedAt?: { lt: Date };
    processedAt?: null;
  };
};

const mockDeleteMany =
  mock<(args: DeleteManyArgs) => Promise<{ count: number }>>();

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    stripeEvent: {
      deleteMany: (args: DeleteManyArgs) => mockDeleteMany(args),
    },
  },
}));

const {
  cleanupOldStripeEvents,
  STRIPE_EVENT_RETENTION_DAYS,
  STRIPE_EVENT_STALE_THRESHOLD_MINUTES,
} = await import("@/shared/domain/stripe-events/cleanup");

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;

describe("cleanupOldStripeEvents", () => {
  beforeEach(() => {
    mockDeleteMany.mockReset();
  });

  test("retention pass: receivedAt < now - 90 days の deleteMany を発行し count を返す", async () => {
    const now = new Date("2026-07-19T00:00:00.000Z");
    mockDeleteMany
      .mockResolvedValueOnce({ count: 42 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await cleanupOldStripeEvents(now);

    expect(result.retention).toBe(42);
    expect(mockDeleteMany).toHaveBeenCalledTimes(2);

    const firstCallArgs = mockDeleteMany.mock.calls[0]?.[0];
    expect(firstCallArgs).toBeDefined();
    if (!firstCallArgs) throw new Error("expected first call args");
    // retention は receivedAt の lt cutoff のみを条件にする (processedAt は問わない)
    expect(firstCallArgs.where.processedAt).toBeUndefined();
    const cutoffMs = firstCallArgs.where.receivedAt?.lt?.getTime() ?? 0;
    expect(cutoffMs).toBe(
      now.getTime() - STRIPE_EVENT_RETENTION_DAYS * MS_PER_DAY,
    );
  });

  test("stale unblock pass: processedAt=null AND receivedAt < now - 10 min の deleteMany を発行", async () => {
    const now = new Date("2026-07-19T12:34:56.000Z");
    mockDeleteMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 3 });

    const result = await cleanupOldStripeEvents(now);

    expect(result.staleUnblock).toBe(3);

    const secondCallArgs = mockDeleteMany.mock.calls[1]?.[0];
    expect(secondCallArgs).toBeDefined();
    if (!secondCallArgs) throw new Error("expected second call args");
    expect(secondCallArgs.where.processedAt).toBeNull();
    const cutoffMs = secondCallArgs.where.receivedAt?.lt?.getTime() ?? 0;
    expect(cutoffMs).toBe(
      now.getTime() - STRIPE_EVENT_STALE_THRESHOLD_MINUTES * MS_PER_MINUTE,
    );
  });

  test("empty table: count 0/0 で正常返却 (throw なし)", async () => {
    mockDeleteMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 0 });

    const result = await cleanupOldStripeEvents(new Date());

    expect(result).toEqual({ retention: 0, staleUnblock: 0 });
  });

  test("両パスとも該当行あり: 独立にカウント (加算しない)", async () => {
    mockDeleteMany
      .mockResolvedValueOnce({ count: 15 })
      .mockResolvedValueOnce({ count: 7 });

    const result = await cleanupOldStripeEvents(new Date());

    expect(result.retention).toBe(15);
    expect(result.staleUnblock).toBe(7);
  });

  test("retention 定数は 90 日 (Stripe retry 上限 3 日 + 監査マージン)", () => {
    expect(STRIPE_EVENT_RETENTION_DAYS).toBe(90);
  });

  test("stale threshold は 10 分 (handler crash 検知の保守的窓)", () => {
    expect(STRIPE_EVENT_STALE_THRESHOLD_MINUTES).toBe(10);
  });
});
