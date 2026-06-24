/**
 * Coupon Server Action 実呼出し統合テスト (singular)
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/coupon.ts の
 * deleteCoupon / updateCouponActive を実 import で呼び出す。
 *
 * bulk 系は coupon-bulk.test.ts で既存実装済。
 * conform 系 (createCoupon / updateCoupon) は couponFormSchema が複雑のため
 * 後続タスクで分離 test 化。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const mockDeleteCoupon = mock<(id: string) => Promise<void>>(() =>
  Promise.resolve(),
);
const mockUpdateCouponActive = mock<
  (id: string, isActive: boolean) => Promise<{ isActive: boolean }>
>((_id, isActive) => Promise.resolve({ isActive }));

mock.module("@/shared/domain/coupons/commands", () => ({
  createCoupon: mock(async () => ({ id: "x" })),
  updateCoupon: mock(async () => {}),
  deleteCoupon: mockDeleteCoupon,
  updateCouponActive: mockUpdateCouponActive,
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => {}),
  revalidateTag: mock(() => {}),
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

type ExecuteOpts<T> = {
  resource: string;
  action: string;
  resourceId?: string;
  execute: (user: { id: string; role: string }) => Promise<T>;
  afterSuccess?: (data: T) => void | Promise<void>;
};

const mockExecute = mock<
  <T>(opts: ExecuteOpts<T>) => Promise<T | { error: string }>
>(async <T>(opts: ExecuteOpts<T>) => {
  const data = await opts.execute({ id: "admin", role: "ADMIN" });
  if (opts.afterSuccess) await opts.afterSuccess(data);
  return data;
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecute,
}));

const { deleteCoupon, updateCouponActive } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/coupon");
const { isMutationError } = await import("@/shared/lib/mutation-result");

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("deleteCoupon (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockDeleteCoupon.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await deleteCoupon("bad");
    expect(isMutationError(r)).toBe(true);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test("正常系: resource=coupon, action=delete", async () => {
    await deleteCoupon(VALID_UUID);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "coupon",
        action: "delete",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockDeleteCoupon).toHaveBeenCalledWith(VALID_UUID);
  });
});

describe("updateCouponActive (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockUpdateCouponActive.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await updateCouponActive("bad", true);
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: isActive=true で resource=coupon, action=update", async () => {
    const result = await updateCouponActive(VALID_UUID, true);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "coupon",
        action: "update",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockUpdateCouponActive).toHaveBeenCalledWith(VALID_UUID, true);
    expect(result).toEqual({ isActive: true });
  });

  test("正常系: isActive=false で command に false が伝搬", async () => {
    await updateCouponActive(VALID_UUID, false);
    expect(mockUpdateCouponActive).toHaveBeenCalledWith(VALID_UUID, false);
  });
});
