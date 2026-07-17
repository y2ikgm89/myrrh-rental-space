import { describe, expect, test } from "bun:test";
import {
  parseRruleString,
  expandInstances,
  countInstances,
  validateRruleForSeries,
} from "@/shared/domain/reservations/series-rrule";

// 2026-07-21 は火曜日（UTC）。BYDAY=TU の RRULE と一致させるため
// dtstart は実際の火曜日を使う（brief 原案の 07-22 は水曜日で BYDAY=TU と
// 不一致だったため実測で補正 — bun run 経由で rrule 実挙動を検証済み）。
const dtstart = new Date("2026-07-21T10:00:00Z");

describe("parseRruleString", () => {
  test("有効な RRULE を parse", () => {
    const rule = parseRruleString("FREQ=WEEKLY;BYDAY=TU;COUNT=10", dtstart);
    expect(rule.options.count).toBe(10);
  });
});

describe("expandInstances", () => {
  test("WEEKLY BYDAY=TU で 10 instance", () => {
    const dates = expandInstances(
      "FREQ=WEEKLY;BYDAY=TU;COUNT=10",
      dtstart,
      new Date("2027-01-01T00:00:00Z"),
    );
    expect(dates).toHaveLength(10);
    expect(dates[0]!.getTime()).toBe(dtstart.getTime());
  });

  test("upTo 境界で truncate", () => {
    const dates = expandInstances(
      "FREQ=WEEKLY;BYDAY=TU;COUNT=52",
      dtstart,
      new Date("2026-09-01T00:00:00Z"),
    );
    // 2026-07-21 から 2026-09-01T00:00Z の間の TU は 6 個
    // (7/21, 7/28, 8/4, 8/11, 8/18, 8/25。次の 9/1 は時刻 10:00Z のため
    // upTo の 00:00Z を超え除外)
    expect(dates).toHaveLength(6);
  });
});

describe("countInstances", () => {
  test("simple count", () => {
    const n = countInstances(
      "FREQ=WEEKLY;BYDAY=TU;COUNT=10",
      dtstart,
      new Date("2027-01-01T00:00:00Z"),
    );
    expect(n).toBe(10);
  });
});

describe("validateRruleForSeries", () => {
  test("valid WEEKLY 10 回", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=WEEKLY;BYDAY=TU;COUNT=10",
      dtstart,
      duration: 120,
      maxInstances: 26,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.instanceCount).toBe(10);
  });

  test("valid DAILY 5 回", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=DAILY;COUNT=5",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(true);
  });

  test("valid MONTHLY 3 回", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=MONTHLY;BYMONTHDAY=15;COUNT=3",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(true);
  });

  test("invalid FREQ (YEARLY) → error", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=YEARLY;COUNT=3",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/FREQ.*サポート/);
  });

  test("invalid FREQ (SECONDLY) → error", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=SECONDLY;COUNT=3",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
  });

  test("count 上限超過 → error", () => {
    const result = validateRruleForSeries({
      rrule: "FREQ=WEEKLY;COUNT=100",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/上限|最大|maximum/);
  });

  test("UNTIL でも count 越える → error", () => {
    // 毎週で 1 年半 = 78 回 (26 超え)
    const result = validateRruleForSeries({
      rrule: "FREQ=WEEKLY;UNTIL=20280101T000000Z",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
  });

  test("rrule 文法 error → error", () => {
    const result = validateRruleForSeries({
      rrule: "INVALID_RRULE_STRING",
      dtstart,
      duration: 60,
      maxInstances: 26,
    });
    expect(result.ok).toBe(false);
  });
});
