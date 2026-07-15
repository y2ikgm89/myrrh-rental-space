import { describe, expect, test } from "bun:test";
import {
  rateBreakdownSchema,
  isLegacyRateBreakdown,
} from "@/shared/lib/pricing/rate-breakdown";

describe("rateBreakdownSchema", () => {
  test("valid full breakdown", () => {
    const valid = {
      schemaVersion: 1 as const,
      segments: [
        {
          fromIso: "2026-07-15T10:00:00+09:00",
          toIso: "2026-07-15T12:00:00+09:00",
          hours: 2,
          hourlyPrice: 2000,
          subtotal: 4000,
          ratePlanId: null,
          ratePlanName: "基本料金",
          isHoliday: false,
        },
      ],
      totalHours: 2,
      totalBasePrice: 4000,
      holidayFlags: {},
    };
    expect(rateBreakdownSchema.parse(valid)).toEqual(valid);
  });

  test("legacy breakdown も parse できる (legacy フラグ許容)", () => {
    const legacy = {
      schemaVersion: 1,
      segments: [],
      totalHours: 0,
      totalBasePrice: 0,
      holidayFlags: {},
      legacy: true,
    };
    expect(() => rateBreakdownSchema.parse(legacy)).not.toThrow();
  });

  test("schemaVersion !== 1 は reject", () => {
    expect(() =>
      rateBreakdownSchema.parse({
        schemaVersion: 2,
        segments: [],
        totalHours: 0,
        totalBasePrice: 0,
        holidayFlags: {},
      }),
    ).toThrow();
  });

  test("segments が array でない場合 reject", () => {
    expect(() =>
      rateBreakdownSchema.parse({
        schemaVersion: 1,
        segments: null,
        totalHours: 0,
        totalBasePrice: 0,
        holidayFlags: {},
      }),
    ).toThrow();
  });
});

describe("isLegacyRateBreakdown", () => {
  test("legacy: true フラグを検知", () => {
    expect(isLegacyRateBreakdown({ schemaVersion: 1, legacy: true })).toBe(
      true,
    );
  });

  test("legacy フラグなしは false", () => {
    expect(
      isLegacyRateBreakdown({ schemaVersion: 1, segments: [{ hours: 2 }] }),
    ).toBe(false);
  });

  test("null / 不正な入力は true (念のため fallback 経路に載せる)", () => {
    expect(isLegacyRateBreakdown(null)).toBe(true);
    expect(isLegacyRateBreakdown(undefined)).toBe(true);
  });
});
