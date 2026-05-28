import { describe, test, expect } from "bun:test";

import { isMonthlyClosureDate } from "@/shared/lib/reservation/time-slots-utils";
import type { MonthlyClosure } from "@/shared/lib/json-validators";

// 2026-12 の月曜: 7(第1), 14(第2), 21(第3), 28(第4)。最終月曜=28。
const THIRD_MONDAY = new Date("2026-12-21T00:00:00");
const FIRST_MONDAY = new Date("2026-12-07T00:00:00");
const LAST_MONDAY = new Date("2026-12-28T00:00:00");
const A_TUESDAY = new Date("2026-12-22T00:00:00");

const THIRD_MONDAY_RULE: MonthlyClosure = { weekday: "monday", week: "third" };

describe("isMonthlyClosureDate", () => {
  test("ルールが空/undefined なら常に false", () => {
    expect(isMonthlyClosureDate(THIRD_MONDAY, [])).toBe(false);
    expect(isMonthlyClosureDate(THIRD_MONDAY, undefined)).toBe(false);
  });

  test("第3月曜ルール: 第3月曜は true", () => {
    expect(isMonthlyClosureDate(THIRD_MONDAY, [THIRD_MONDAY_RULE])).toBe(true);
  });

  test("第3月曜ルール: 第1月曜は false", () => {
    expect(isMonthlyClosureDate(FIRST_MONDAY, [THIRD_MONDAY_RULE])).toBe(false);
  });

  test("第3月曜ルール: 同じ第3週でも別曜日(火)は false", () => {
    expect(isMonthlyClosureDate(A_TUESDAY, [THIRD_MONDAY_RULE])).toBe(false);
  });

  test("最終月曜ルール: 2026-12 は 28 が最終月曜 → true", () => {
    const rule: MonthlyClosure = { weekday: "monday", week: "last" };
    expect(isMonthlyClosureDate(LAST_MONDAY, [rule])).toBe(true);
    expect(isMonthlyClosureDate(THIRD_MONDAY, [rule])).toBe(false);
  });

  test("第4月曜 = 最終月曜 のケース (2026-12-28 は第4かつ最終)", () => {
    expect(
      isMonthlyClosureDate(LAST_MONDAY, [
        { weekday: "monday", week: "fourth" },
      ]),
    ).toBe(true);
  });

  test("複数ルール: いずれか一致で true", () => {
    const rules: MonthlyClosure[] = [
      { weekday: "monday", week: "first" },
      { weekday: "monday", week: "third" },
    ];
    expect(isMonthlyClosureDate(FIRST_MONDAY, rules)).toBe(true);
    expect(isMonthlyClosureDate(THIRD_MONDAY, rules)).toBe(true);
    expect(isMonthlyClosureDate(LAST_MONDAY, rules)).toBe(false);
  });

  test("第5週が存在する月: 2026-11 の月曜は 2,9,16,23,30。30は第5かつ最終", () => {
    // 2026-11-30 は第5月曜 = 最終月曜
    const fifthMonday = new Date("2026-11-30T00:00:00");
    expect(
      isMonthlyClosureDate(fifthMonday, [{ weekday: "monday", week: "last" }]),
    ).toBe(true);
    // 第4月曜ルールには該当しない (23 が第4)
    expect(
      isMonthlyClosureDate(fifthMonday, [
        { weekday: "monday", week: "fourth" },
      ]),
    ).toBe(false);
  });
});
