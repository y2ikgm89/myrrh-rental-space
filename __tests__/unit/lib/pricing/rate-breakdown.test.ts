import { describe, expect, test } from "bun:test";
import { rateBreakdownSchema } from "@/shared/lib/pricing/rate-breakdown";

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

  test("empty segments breakdown", () => {
    const empty = {
      schemaVersion: 1 as const,
      segments: [],
      totalHours: 0,
      totalBasePrice: 0,
      holidayFlags: {},
    };
    expect(rateBreakdownSchema.parse(empty)).toEqual(empty);
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

  test("unknown keys は reject", () => {
    expect(() =>
      rateBreakdownSchema.parse({
        schemaVersion: 1,
        segments: [],
        totalHours: 0,
        totalBasePrice: 0,
        holidayFlags: {},
        legacy: true,
      }),
    ).toThrow();
  });
});
