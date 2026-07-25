/**
 * 毎月定休の公開表示ラベル
 */

import { describe, expect, test } from "bun:test";
import {
  formatMonthlyClosureLabel,
  parseMonthlyClosuresForDisplay,
} from "@/shared/lib/business-hours/monthly-closure-display";

describe("formatMonthlyClosureLabel", () => {
  test("第3月曜日形式で整形する", () => {
    expect(
      formatMonthlyClosureLabel({ weekday: "monday", week: "third" }),
    ).toBe("第3月曜日");
  });
});

describe("parseMonthlyClosuresForDisplay", () => {
  test("businessHours が null の場合は空配列", () => {
    expect(parseMonthlyClosuresForDisplay(null)).toEqual([]);
  });

  test("monthlyClosures から定休行を返す", () => {
    expect(
      parseMonthlyClosuresForDisplay({
        monday: {
          isOpen: true,
          slots: [{ openTime: "09:00", closeTime: "18:00" }],
        },
        tuesday: { isOpen: false, slots: [] },
        wednesday: { isOpen: false, slots: [] },
        thursday: { isOpen: false, slots: [] },
        friday: { isOpen: false, slots: [] },
        saturday: { isOpen: false, slots: [] },
        sunday: { isOpen: false, slots: [] },
        monthlyClosures: [{ weekday: "monday", week: "third" }],
      }),
    ).toEqual(["第3月曜日 定休"]);
  });
});
