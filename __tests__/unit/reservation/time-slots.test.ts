import { describe, expect, test } from "bun:test";

import {
  generateFallbackSlots,
  generateSlotsFromBusinessHours,
} from "@/shared/lib/reservation/time-slots";

describe("generateSlotsFromBusinessHours - 30分刻み", () => {
  const businessHours = {
    monday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "12:00" }],
    },
    tuesday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "12:00" }],
    },
    wednesday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "12:00" }],
    },
    thursday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "12:00" }],
    },
    friday: {
      isOpen: true,
      slots: [{ openTime: "09:00", closeTime: "12:00" }],
    },
    saturday: { isOpen: false, slots: [] },
    sunday: { isOpen: false, slots: [] },
  };

  test("30分刻みでスロットを生成する", () => {
    // 2026-03-23 is Monday
    const slots = generateSlotsFromBusinessHours(businessHours, "2026-03-23");
    expect(slots.map((s) => s.time)).toEqual([
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
    ]);
    expect(slots.every((s) => s.available)).toBe(true);
  });

  test("休業日は空配列を返す", () => {
    // 2026-03-28 is Saturday
    const slots = generateSlotsFromBusinessHours(businessHours, "2026-03-28");
    expect(slots).toEqual([]);
  });

  test("複数営業時間帯（昼休みあり）を正しく処理する", () => {
    const lunchBreakHours = {
      ...businessHours,
      monday: {
        isOpen: true,
        slots: [
          { openTime: "09:00", closeTime: "12:00" },
          { openTime: "13:00", closeTime: "17:00" },
        ],
      },
    };
    const slots = generateSlotsFromBusinessHours(lunchBreakHours, "2026-03-23");
    const times = slots.map((s) => s.time);
    expect(times).toContain("09:00");
    expect(times).toContain("11:30");
    expect(times).not.toContain("12:00");
    expect(times).not.toContain("12:30");
    expect(times).toContain("13:00");
    expect(times).toContain("16:30");
  });
});

describe("generateFallbackSlots - 30分刻み", () => {
  test("デフォルト営業時間で30分刻みのスロットを生成する", () => {
    const slots = generateFallbackSlots();
    // DEFAULT_BUSINESS_HOURS: start=9, end=21 → 24 slots
    expect(slots.length).toBe(24);
    expect(slots[0]?.time).toBe("09:00");
    expect(slots[1]?.time).toBe("09:30");
    expect(slots[slots.length - 1]?.time).toBe("20:30");
  });
});
