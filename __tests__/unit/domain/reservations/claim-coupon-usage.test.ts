/**
 * claimCouponUsage — atomic coupon claim の WHERE 契約。
 *
 * usageLimit に加え validFrom / validUntil / minReservationAmount を同一 UPDATE
 * で強制し、claim=0 は fail-closed（DomainError CONFLICT）であることを固定する。
 */

import { describe, expect, mock, test } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

const mockExecuteRaw = mock(
  (_strings: TemplateStringsArray, ..._values: unknown[]) => Promise.resolve(1),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ $executeRaw: mockExecuteRaw }),
  },
}));

const { claimCouponUsage } =
  await import("@/shared/domain/reservations/payloads");

type Tx = {
  $executeRaw: typeof mockExecuteRaw;
};

function makeTx(): Tx {
  return { $executeRaw: mockExecuteRaw };
}

describe("claimCouponUsage", () => {
  test("UPDATE WHERE に isActive / usageLimit / validFrom / validUntil / minReservationAmount を含む", async () => {
    mockExecuteRaw.mockClear();
    mockExecuteRaw.mockResolvedValue(1);

    const now = new Date("2026-07-26T00:00:00.000Z");
    await claimCouponUsage(makeTx() as never, {
      couponId: "11111111-1111-1111-1111-111111111111",
      basePrice: 5000,
      now,
    });

    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    const call = mockExecuteRaw.mock.calls[0];
    const sql = (call?.[0] as TemplateStringsArray).join("?");
    expect(sql).toContain('UPDATE "coupons"');
    expect(sql).toContain("usage_count");
    expect(sql).toContain("is_active");
    expect(sql).toContain("usage_limit");
    expect(sql).toContain("valid_from");
    expect(sql).toContain("valid_until");
    expect(sql).toContain("min_reservation_amount");

    // couponId, now (validFrom), now (validUntil), basePrice がバインドされる
    expect(call?.[1]).toBe("11111111-1111-1111-1111-111111111111");
    expect(call?.[2]).toEqual(now);
    expect(call?.[3]).toEqual(now);
    expect(call?.[4]).toBe(5000);
  });

  test("claim=0 は DomainError(CONFLICT) で fail-closed", async () => {
    mockExecuteRaw.mockClear();
    mockExecuteRaw.mockResolvedValue(0);

    const rejection = claimCouponUsage(makeTx() as never, {
      couponId: "11111111-1111-1111-1111-111111111111",
      basePrice: 1000,
      conflictMessage: "custom conflict",
    });
    await expect(rejection).rejects.toBeInstanceOf(DomainError);
    await expect(rejection).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      claimCouponUsage(makeTx() as never, {
        couponId: "11111111-1111-1111-1111-111111111111",
        basePrice: 1000,
        conflictMessage: "custom conflict",
      }),
    ).rejects.toThrow("custom conflict");
  });
});
