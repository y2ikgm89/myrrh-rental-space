import { describe, expect, test } from "bun:test";
import { isJapaneseHoliday } from "@/shared/lib/date/holiday";

describe("isJapaneseHoliday", () => {
  test("元日 (2026-01-01) は祝日", () => {
    expect(isJapaneseHoliday("2026-01-01")).toBe(true);
  });

  test("こどもの日 (2026-05-05) は祝日", () => {
    expect(isJapaneseHoliday("2026-05-05")).toBe(true);
  });

  test("平日 (2026-01-05 月) は非祝日", () => {
    expect(isJapaneseHoliday("2026-01-05")).toBe(false);
  });

  test("土曜日 (2026-01-03) は非祝日 (曜日と祝日は独立軸)", () => {
    expect(isJapaneseHoliday("2026-01-03")).toBe(false);
  });

  test("振替休日 (2026-05-06 水) は祝日", () => {
    // 2026 GW: 5/3 日 (憲法記念日), 5/4 月 (みどりの日), 5/5 火 (こどもの日)
    // → 5/3 が日曜のため、5/6 水が振替休日
    expect(isJapaneseHoliday("2026-05-06")).toBe(true);
  });
});
