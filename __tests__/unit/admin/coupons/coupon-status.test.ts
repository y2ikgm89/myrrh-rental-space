/**
 * `_lib/coupon-status.ts` のテスト（pure function）
 *
 * `getCouponStatus(coupon, now)` の優先順位:
 * 1. `isActive: false` → `inactive`
 * 2. `validFrom > now` → `notStarted`
 * 3. `validUntil < now` → `expired`
 * 4. `usageCount >= usageLimit` → `limitReached`
 * 5. それ以外 → `active`
 */

import { describe, test, expect } from "bun:test";
import {
  getCouponStatus,
  deriveCouponStatusesNow,
  type CouponStatusInput,
} from "@/app/(admin)/admin/(dashboard)/coupons/_lib/coupon-status";

const NOW = new Date("2026-05-03T12:00:00.000Z");

const baseCoupon: CouponStatusInput = {
  isActive: true,
  validFrom: "2026-01-01T00:00:00.000Z",
  validUntil: "2026-12-31T23:59:59.000Z",
  usageLimit: 100,
  usageCount: 0,
};

describe("getCouponStatus", () => {
  describe("優先順位", () => {
    test("isActive=false が最優先で inactive を返す（他条件無関係）", () => {
      // 期限切れ + 上限到達状態でも isActive: false なら inactive
      const coupon: CouponStatusInput = {
        isActive: false,
        validFrom: "2026-01-01T00:00:00.000Z",
        validUntil: "2025-01-01T00:00:00.000Z",
        usageLimit: 10,
        usageCount: 100,
      };
      expect(getCouponStatus(coupon, NOW)).toBe("inactive");
    });

    test("isActive=true + validFrom > now → notStarted", () => {
      const coupon: CouponStatusInput = {
        ...baseCoupon,
        validFrom: "2026-06-01T00:00:00.000Z",
      };
      expect(getCouponStatus(coupon, NOW)).toBe("notStarted");
    });

    test("notStarted は expired より優先（同時には起こらないが念のため）", () => {
      // 開始日が今後で、終了日が過去（不整合データ）
      const coupon: CouponStatusInput = {
        ...baseCoupon,
        validFrom: "2026-06-01T00:00:00.000Z",
        validUntil: "2025-01-01T00:00:00.000Z",
      };
      expect(getCouponStatus(coupon, NOW)).toBe("notStarted");
    });

    test("validUntil < now → expired（usageLimit と無関係）", () => {
      const coupon: CouponStatusInput = {
        ...baseCoupon,
        validUntil: "2025-01-01T00:00:00.000Z",
        usageCount: 100,
        usageLimit: 100,
      };
      expect(getCouponStatus(coupon, NOW)).toBe("expired");
    });

    test("usageCount >= usageLimit → limitReached", () => {
      const coupon: CouponStatusInput = {
        ...baseCoupon,
        usageCount: 100,
        usageLimit: 100,
      };
      expect(getCouponStatus(coupon, NOW)).toBe("limitReached");
    });

    test("usageCount > usageLimit でも limitReached（境界外でも同じ判定）", () => {
      const coupon: CouponStatusInput = {
        ...baseCoupon,
        usageCount: 150,
        usageLimit: 100,
      };
      expect(getCouponStatus(coupon, NOW)).toBe("limitReached");
    });

    test("全条件クリアなら active", () => {
      expect(getCouponStatus(baseCoupon, NOW)).toBe("active");
    });
  });

  describe("境界値", () => {
    test("validFrom == now は notStarted ではなく active（開始時刻ちょうどから利用可）", () => {
      const coupon: CouponStatusInput = {
        ...baseCoupon,
        validFrom: NOW.toISOString(),
      };
      expect(getCouponStatus(coupon, NOW)).toBe("active");
    });

    test("validUntil == now は expired ではなく active（終了時刻ちょうどまで利用可）", () => {
      const coupon: CouponStatusInput = {
        ...baseCoupon,
        validUntil: NOW.toISOString(),
      };
      expect(getCouponStatus(coupon, NOW)).toBe("active");
    });

    test("usageCount == usageLimit - 1 は active", () => {
      const coupon: CouponStatusInput = {
        ...baseCoupon,
        usageCount: 99,
        usageLimit: 100,
      };
      expect(getCouponStatus(coupon, NOW)).toBe("active");
    });
  });

  describe("nullable フィールド", () => {
    test("validUntil = null は無期限として扱う（active）", () => {
      const coupon: CouponStatusInput = {
        ...baseCoupon,
        validUntil: null,
      };
      expect(getCouponStatus(coupon, NOW)).toBe("active");
    });

    test("usageLimit = null は上限なしとして扱う（active）", () => {
      const coupon: CouponStatusInput = {
        ...baseCoupon,
        usageLimit: null,
        usageCount: 99999,
      };
      expect(getCouponStatus(coupon, NOW)).toBe("active");
    });
  });
});

describe("deriveCouponStatusesNow", () => {
  test("各クーポンに `status` プロパティを埋め込んだ配列を返す", () => {
    const coupons = [
      { ...baseCoupon, id: "a" },
      { ...baseCoupon, id: "b", isActive: false },
    ];
    const result = deriveCouponStatusesNow(coupons);
    expect(result).toHaveLength(2);
    expect(result[0]?.status).toBe("active");
    expect(result[1]?.status).toBe("inactive");
  });

  test("元の配列を mutate しない（immutable）", () => {
    const coupons = [{ ...baseCoupon, id: "a" }];
    const original = JSON.stringify(coupons);
    deriveCouponStatusesNow(coupons);
    expect(JSON.stringify(coupons)).toBe(original);
  });

  test("空配列でも安全に空配列を返す", () => {
    expect(deriveCouponStatusesNow([])).toEqual([]);
  });
});
