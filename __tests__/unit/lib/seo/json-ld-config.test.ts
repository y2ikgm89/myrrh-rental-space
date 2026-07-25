/**
 * JSON-LD config ユニットテスト（Organization opening hours）
 */

import { describe, expect, test } from "bun:test";
import { convertToOpeningHoursSpecification } from "@/public/lib/seo/json-ld-config";

describe("convertToOpeningHoursSpecification", () => {
  test("businessHours が null の場合 undefined", () => {
    expect(convertToOpeningHoursSpecification(null)).toBeUndefined();
  });

  test("monthlyClosures のみの場合は undefined（曜日スロットなし）", () => {
    expect(
      convertToOpeningHoursSpecification({
        monthlyClosures: [{ weekday: "monday", week: "third" }],
      }),
    ).toBeUndefined();
  });

  test("同じ時間帯の曜日をグループ化する", () => {
    const specs = convertToOpeningHoursSpecification({
      monday: {
        isOpen: true,
        slots: [{ openTime: "09:00", closeTime: "18:00" }],
      },
      tuesday: {
        isOpen: true,
        slots: [{ openTime: "09:00", closeTime: "18:00" }],
      },
      wednesday: { isOpen: false, slots: [] },
      thursday: { isOpen: false, slots: [] },
      friday: { isOpen: false, slots: [] },
      saturday: { isOpen: false, slots: [] },
      sunday: { isOpen: false, slots: [] },
    });

    expect(specs).toHaveLength(1);
    expect(specs?.[0]).toEqual({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday"],
      opens: "09:00",
      closes: "18:00",
    });
  });
});
