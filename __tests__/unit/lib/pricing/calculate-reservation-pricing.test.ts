import { describe, expect, test } from "bun:test";
import { calculateReservationPricing } from "@/shared/lib/pricing/calculate-reservation-pricing";

const jst = (iso: string) => new Date(`${iso}:00+09:00`);
const noHoliday = () => false;

const baseSpace = {
  hourlyPrice: 2000,
  discountType: "NONE" as const,
  discountValue: null,
  durationDiscountOverride: "INHERIT" as const,
  taxRateType: "STANDARD" as const,
};

const baseSettings = {
  taxStandardRate: 10,
  taxReducedRate: 8,
  taxDisplayModePublic: "TAX_INCLUDED" as const,
  durationDiscountEnabled: false,
  durationDiscountRules: null,
  discountCombinationMode: "BEST" as const,
  showOriginalPrice: false,
};

describe("calculateReservationPricing", () => {
  test("rate plan なし・割引なし: 基本料金 + 標準税率", () => {
    const result = calculateReservationPricing({
      startDateTime: jst("2026-07-15T10:00"),
      endDateTime: jst("2026-07-15T12:00"),
      space: baseSpace,
      ratePlans: [],
      reservationSettings: baseSettings,
      coupon: null,
      holidayJudge: noHoliday,
    });
    expect(result.basePrice).toBe(4000);
    expect(result.totalPrice).toBe(4000); // 割引なし
    expect(result.taxRate).toBe(10);
    expect(result.taxAmount).toBe(400);
    expect(result.totalPriceWithTax).toBe(4400);
    expect(result.rateBreakdown.segments).toHaveLength(1);
  });

  test("曜日別 rate plan: 金曜のみ 4000円/h", () => {
    const result = calculateReservationPricing({
      startDateTime: jst("2026-07-17T10:00"), // 金
      endDateTime: jst("2026-07-17T12:00"),
      space: baseSpace,
      ratePlans: [
        {
          id: "f",
          name: "金曜料金",
          hourlyPrice: 4000,
          daysOfWeek: ["FRIDAY"],
          holidayMode: "ANY",
          startTime: null,
          endTime: null,
          effectiveFrom: null,
          effectiveTo: null,
          updatedAt: new Date("2026-01-01"),
        },
      ],
      reservationSettings: baseSettings,
      coupon: null,
      holidayJudge: noHoliday,
    });
    expect(result.basePrice).toBe(8000);
  });

  test("既存の space discount と併用: 10% 割引", () => {
    const result = calculateReservationPricing({
      startDateTime: jst("2026-07-15T10:00"),
      endDateTime: jst("2026-07-15T12:00"),
      space: { ...baseSpace, discountType: "PERCENTAGE", discountValue: 10 },
      ratePlans: [],
      reservationSettings: baseSettings,
      coupon: null,
      holidayJudge: noHoliday,
    });
    expect(result.basePrice).toBe(4000);
    expect(result.spaceDiscountAmount).toBe(400);
    expect(result.totalPrice).toBe(3600);
  });

  test("best モードで長時間割引が勝つ場合 appliedCoupon は null", () => {
    const smallCoupon = {
      id: "coupon-small",
      code: "SMALL10",
      name: "10%OFF",
      type: "PERCENTAGE" as const,
      discountValue: 10,
      maxDiscountAmount: null,
      canCombineWithDurationDiscount: true,
    };
    const result = calculateReservationPricing({
      startDateTime: jst("2026-07-15T10:00"),
      endDateTime: jst("2026-07-15T18:00"),
      space: baseSpace,
      ratePlans: [],
      reservationSettings: {
        ...baseSettings,
        durationDiscountEnabled: true,
        durationDiscountRules: [
          { hours: 3, discountRate: 5 },
          { hours: 5, discountRate: 10 },
          { hours: 8, discountRate: 20 },
        ],
        discountCombinationMode: "BEST",
      },
      coupon: smallCoupon,
      holidayJudge: noHoliday,
    });

    expect(result.durationDiscountAmount).toBeGreaterThan(0);
    expect(result.couponDiscountAmount).toBe(0);
    expect(result.appliedCoupon).toBeNull();
  });

  test("best モードでクーポンが勝つ場合 appliedCoupon を返す", () => {
    const bigCoupon = {
      id: "coupon-big",
      code: "BIG50",
      name: "50%OFF",
      type: "PERCENTAGE" as const,
      discountValue: 50,
      maxDiscountAmount: null,
      canCombineWithDurationDiscount: true,
    };
    const result = calculateReservationPricing({
      startDateTime: jst("2026-07-15T10:00"),
      endDateTime: jst("2026-07-15T13:00"),
      space: baseSpace,
      ratePlans: [],
      reservationSettings: {
        ...baseSettings,
        durationDiscountEnabled: true,
        durationDiscountRules: [{ hours: 3, discountRate: 5 }],
        discountCombinationMode: "BEST",
      },
      coupon: bigCoupon,
      holidayJudge: noHoliday,
    });

    expect(result.couponDiscountAmount).toBeGreaterThan(0);
    expect(result.appliedCoupon).toEqual({
      id: "coupon-big",
      code: "BIG50",
      name: "50%OFF",
    });
  });
});
