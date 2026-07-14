import { describe, expect, test } from "bun:test";
import { calculateReservationPricing } from "@/shared/lib/pricing/calculate-reservation-pricing";

const jst = (iso: string) => new Date(`${iso}:00+09:00`);
const noHoliday = () => false;

const baseSpace = {
  hourlyPrice: 2000,
  discountType: "none" as const,
  discountValue: null,
  durationDiscountOverride: "inherit" as const,
  taxRateType: "standard" as const,
};

const baseSettings = {
  taxStandardRate: 10,
  taxReducedRate: 8,
  taxDisplayModePublic: "tax_included" as const,
  durationDiscountEnabled: false,
  durationDiscountRules: null,
  discountCombinationMode: "best" as const,
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
          holidayMode: "any",
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
      space: { ...baseSpace, discountType: "percentage", discountValue: 10 },
      ratePlans: [],
      reservationSettings: baseSettings,
      coupon: null,
      holidayJudge: noHoliday,
    });
    expect(result.basePrice).toBe(4000);
    expect(result.spaceDiscountAmount).toBe(400);
    expect(result.totalPrice).toBe(3600);
  });
});
