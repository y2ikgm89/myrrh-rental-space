import { describe, test, expect } from "bun:test";
import type { BusinessHours } from "@/shared/lib/json-validators";
import {
  getWeekdayKey,
  parseTime,
  generateFallbackSlots,
  generateSlotsFromBusinessHours,
} from "@/shared/lib/reservation/time-slots";

// =============================================================================
// テスト用フィクスチャ
// =============================================================================

/** 全日営業の BusinessHours（月〜日 9:00-17:00 の単一時間帯） */
const BUSINESS_HOURS_SINGLE_SLOT: BusinessHours = {
  sunday: { isOpen: true, slots: [{ openTime: "09:00", closeTime: "17:00" }] },
  monday: { isOpen: true, slots: [{ openTime: "09:00", closeTime: "17:00" }] },
  tuesday: {
    isOpen: true,
    slots: [{ openTime: "09:00", closeTime: "17:00" }],
  },
  wednesday: {
    isOpen: true,
    slots: [{ openTime: "09:00", closeTime: "17:00" }],
  },
  thursday: {
    isOpen: true,
    slots: [{ openTime: "09:00", closeTime: "17:00" }],
  },
  friday: { isOpen: true, slots: [{ openTime: "09:00", closeTime: "17:00" }] },
  saturday: {
    isOpen: true,
    slots: [{ openTime: "09:00", closeTime: "17:00" }],
  },
};

/** 月曜が休業日の BusinessHours */
const BUSINESS_HOURS_MONDAY_CLOSED: BusinessHours = {
  ...BUSINESS_HOURS_SINGLE_SLOT,
  monday: { isOpen: false, slots: [] },
};

/** 月曜が複数時間帯の BusinessHours（9:00-12:00, 13:00-17:00） */
const BUSINESS_HOURS_MULTIPLE_SLOTS: BusinessHours = {
  ...BUSINESS_HOURS_SINGLE_SLOT,
  monday: {
    isOpen: true,
    slots: [
      { openTime: "09:00", closeTime: "12:00" },
      { openTime: "13:00", closeTime: "17:00" },
    ],
  },
};

/** 重複する時間帯（9:00-12:00 と 10:00-14:00） */
const BUSINESS_HOURS_OVERLAPPING_SLOTS: BusinessHours = {
  ...BUSINESS_HOURS_SINGLE_SLOT,
  monday: {
    isOpen: true,
    slots: [
      { openTime: "09:00", closeTime: "12:00" },
      { openTime: "10:00", closeTime: "14:00" },
    ],
  },
};

// 月曜日の日付（UTC 正午なので JST でも同日）
const MONDAY_DATE = "2024-01-15"; // 月曜日
const SUNDAY_DATE = "2024-01-14"; // 日曜日
const SATURDAY_DATE = "2024-01-20"; // 土曜日

// =============================================================================
// parseTime
// =============================================================================

describe("parseTime", () => {
  describe("正常系", () => {
    test('"09:00" を { hour: 9, minute: 0 } にパースする', () => {
      expect(parseTime("09:00")).toEqual({ hour: 9, minute: 0 });
    });

    test('"14:30" を { hour: 14, minute: 30 } にパースする', () => {
      expect(parseTime("14:30")).toEqual({ hour: 14, minute: 30 });
    });

    test('"00:00" を { hour: 0, minute: 0 } にパースする', () => {
      expect(parseTime("00:00")).toEqual({ hour: 0, minute: 0 });
    });

    test('"23:59" を { hour: 23, minute: 59 } にパースする', () => {
      expect(parseTime("23:59")).toEqual({ hour: 23, minute: 59 });
    });
  });
});

// =============================================================================
// getWeekdayKey
// =============================================================================

describe("getWeekdayKey", () => {
  describe("正常系", () => {
    test('2024-01-15（月曜日）→ "monday" を返す', () => {
      // UTC 正午を使用してタイムゾーンのずれを防ぐ
      const date = new Date("2024-01-15T12:00:00Z");
      expect(getWeekdayKey(date)).toBe("monday");
    });

    test('2024-01-14（日曜日）→ "sunday" を返す', () => {
      const date = new Date("2024-01-14T12:00:00Z");
      expect(getWeekdayKey(date)).toBe("sunday");
    });

    test('2024-01-20（土曜日）→ "saturday" を返す', () => {
      const date = new Date("2024-01-20T12:00:00Z");
      expect(getWeekdayKey(date)).toBe("saturday");
    });

    test('2024-01-16（火曜日）→ "tuesday" を返す', () => {
      const date = new Date("2024-01-16T12:00:00Z");
      expect(getWeekdayKey(date)).toBe("tuesday");
    });

    test('2024-01-17（水曜日）→ "wednesday" を返す', () => {
      const date = new Date("2024-01-17T12:00:00Z");
      expect(getWeekdayKey(date)).toBe("wednesday");
    });

    test('2024-01-18（木曜日）→ "thursday" を返す', () => {
      const date = new Date("2024-01-18T12:00:00Z");
      expect(getWeekdayKey(date)).toBe("thursday");
    });

    test('2024-01-19（金曜日）→ "friday" を返す', () => {
      const date = new Date("2024-01-19T12:00:00Z");
      expect(getWeekdayKey(date)).toBe("friday");
    });
  });
});

// =============================================================================
// generateFallbackSlots
// =============================================================================

describe("generateFallbackSlots", () => {
  describe("正常系", () => {
    test("DEFAULT_BUSINESS_HOURS (9-21) に基づき 12 スロットを生成する", () => {
      const slots = generateFallbackSlots();
      expect(slots).toHaveLength(12);
    });

    test('最初のスロットが "09:00" である', () => {
      const slots = generateFallbackSlots();
      expect(slots[0]?.time).toBe("09:00");
    });

    test('最後のスロットが "20:00" である', () => {
      const slots = generateFallbackSlots();
      expect(slots[slots.length - 1]?.time).toBe("20:00");
    });

    test("全スロットが available: true である", () => {
      const slots = generateFallbackSlots();
      expect(slots.every((s) => s.available === true)).toBe(true);
    });

    test("スロットが 1 時間刻みで連続している（09:00〜20:00）", () => {
      const slots = generateFallbackSlots();
      const times = slots.map((s) => s.time);
      expect(times).toEqual([
        "09:00",
        "10:00",
        "11:00",
        "12:00",
        "13:00",
        "14:00",
        "15:00",
        "16:00",
        "17:00",
        "18:00",
        "19:00",
        "20:00",
      ]);
    });
  });
});

// =============================================================================
// generateSlotsFromBusinessHours
// =============================================================================

describe("generateSlotsFromBusinessHours", () => {
  describe("businessHours が null の場合", () => {
    test("フォールバックスロット（12スロット）を返す", () => {
      const slots = generateSlotsFromBusinessHours(null, MONDAY_DATE);
      expect(slots).toHaveLength(12);
    });

    test("フォールバックスロットの最初が 09:00、最後が 20:00 である", () => {
      const slots = generateSlotsFromBusinessHours(null, MONDAY_DATE);
      expect(slots[0]?.time).toBe("09:00");
      expect(slots[slots.length - 1]?.time).toBe("20:00");
    });
  });

  describe("休業日の場合", () => {
    test("isOpen: false の曜日は空配列を返す", () => {
      const slots = generateSlotsFromBusinessHours(
        BUSINESS_HOURS_MONDAY_CLOSED,
        MONDAY_DATE,
      );
      expect(slots).toHaveLength(0);
    });

    test("slots 配列が空でも休業扱いとなり空配列を返す", () => {
      const businessHours: BusinessHours = {
        ...BUSINESS_HOURS_SINGLE_SLOT,
        monday: { isOpen: true, slots: [] },
      };
      const slots = generateSlotsFromBusinessHours(businessHours, MONDAY_DATE);
      expect(slots).toHaveLength(0);
    });
  });

  describe("単一時間帯（9:00-17:00）の場合", () => {
    test("8 スロットを返す", () => {
      const slots = generateSlotsFromBusinessHours(
        BUSINESS_HOURS_SINGLE_SLOT,
        MONDAY_DATE,
      );
      expect(slots).toHaveLength(8);
    });

    test('最初のスロットが "09:00" で最後が "16:00" である', () => {
      const slots = generateSlotsFromBusinessHours(
        BUSINESS_HOURS_SINGLE_SLOT,
        MONDAY_DATE,
      );
      expect(slots[0]?.time).toBe("09:00");
      expect(slots[slots.length - 1]?.time).toBe("16:00");
    });

    test("全スロットが available: true である", () => {
      const slots = generateSlotsFromBusinessHours(
        BUSINESS_HOURS_SINGLE_SLOT,
        MONDAY_DATE,
      );
      expect(slots.every((s) => s.available === true)).toBe(true);
    });
  });

  describe("複数時間帯（9:00-12:00, 13:00-17:00）の場合", () => {
    test("昼休みを除いた 7 スロットを返す", () => {
      const slots = generateSlotsFromBusinessHours(
        BUSINESS_HOURS_MULTIPLE_SLOTS,
        MONDAY_DATE,
      );
      expect(slots).toHaveLength(7);
    });

    test("12:00 のスロットが存在しない（昼休み除外）", () => {
      const slots = generateSlotsFromBusinessHours(
        BUSINESS_HOURS_MULTIPLE_SLOTS,
        MONDAY_DATE,
      );
      const times = slots.map((s) => s.time);
      expect(times).not.toContain("12:00");
    });

    test("スロットが時刻順にソートされている", () => {
      const slots = generateSlotsFromBusinessHours(
        BUSINESS_HOURS_MULTIPLE_SLOTS,
        MONDAY_DATE,
      );
      const times = slots.map((s) => s.time);
      expect(times).toEqual([
        "09:00",
        "10:00",
        "11:00",
        "13:00",
        "14:00",
        "15:00",
        "16:00",
      ]);
    });
  });

  describe("重複する時間帯（9:00-12:00 と 10:00-14:00）の場合", () => {
    test("重複が除去されたスロットを返す", () => {
      const slots = generateSlotsFromBusinessHours(
        BUSINESS_HOURS_OVERLAPPING_SLOTS,
        MONDAY_DATE,
      );
      // 09, 10, 11, 12, 13 の 5 スロット（重複なし）
      expect(slots).toHaveLength(5);
    });

    test("同じ時刻が 2 つ含まれない", () => {
      const slots = generateSlotsFromBusinessHours(
        BUSINESS_HOURS_OVERLAPPING_SLOTS,
        MONDAY_DATE,
      );
      const times = slots.map((s) => s.time);
      const uniqueTimes = new Set(times);
      expect(times).toHaveLength(uniqueTimes.size);
    });

    test("スロットが時刻順にソートされている", () => {
      const slots = generateSlotsFromBusinessHours(
        BUSINESS_HOURS_OVERLAPPING_SLOTS,
        MONDAY_DATE,
      );
      const times = slots.map((s) => s.time);
      expect(times).toEqual(["09:00", "10:00", "11:00", "12:00", "13:00"]);
    });
  });

  describe("曜日判定の確認", () => {
    test("日曜日の date で日曜の設定が適用される", () => {
      // 日曜を休業日に設定
      const businessHours: BusinessHours = {
        ...BUSINESS_HOURS_SINGLE_SLOT,
        sunday: { isOpen: false, slots: [] },
      };
      const slots = generateSlotsFromBusinessHours(businessHours, SUNDAY_DATE);
      expect(slots).toHaveLength(0);
    });

    test("土曜日の date で土曜の設定が適用される", () => {
      // 土曜を別の時間帯に設定
      const businessHours: BusinessHours = {
        ...BUSINESS_HOURS_SINGLE_SLOT,
        saturday: {
          isOpen: true,
          slots: [{ openTime: "10:00", closeTime: "13:00" }],
        },
      };
      const slots = generateSlotsFromBusinessHours(
        businessHours,
        SATURDAY_DATE,
      );
      // 10, 11, 12 の 3 スロット
      expect(slots).toHaveLength(3);
      expect(slots[0]?.time).toBe("10:00");
      expect(slots[slots.length - 1]?.time).toBe("12:00");
    });
  });
});
