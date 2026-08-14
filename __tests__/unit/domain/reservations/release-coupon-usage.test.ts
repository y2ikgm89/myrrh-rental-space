/**
 * releaseCouponUsage — atomic coupon release の WHERE 契約。
 *
 * usageCount を 1 戻す UPDATE は usageCount > 0 の行にだけ当て、
 * 0 件更新は no-op（負数にしない）であることを固定する。
 */

import { describe, expect, mock, test } from "bun:test";

const mockUpdateMany = mock(
  (_args: {
    where: { id: string; usageCount: { gt: number } };
    data: { usageCount: { decrement: number } };
  }) => Promise.resolve({ count: 1 }),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ coupon: { updateMany: mockUpdateMany } }),
  },
}));

const { releaseCouponUsage } =
  await import("@/shared/domain/reservations/payloads");

function makeTx() {
  return { coupon: { updateMany: mockUpdateMany } };
}

describe("releaseCouponUsage", () => {
  test("updateMany は usageCount > 0 の行だけを decrement する", async () => {
    mockUpdateMany.mockClear();
    mockUpdateMany.mockResolvedValue({ count: 1 });

    await releaseCouponUsage(makeTx() as never, {
      couponId: "11111111-1111-1111-1111-111111111111",
    });

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    expect(mockUpdateMany).toHaveBeenCalledWith({
      where: {
        id: "11111111-1111-1111-1111-111111111111",
        usageCount: { gt: 0 },
      },
      data: { usageCount: { decrement: 1 } },
    });
  });
});
