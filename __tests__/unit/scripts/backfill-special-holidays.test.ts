/**
 * 「特別休業日」→ BlockedDate の移行で、**何を移し・何を移さないか**を固定する。
 *
 * `locations.special_holidays` は要素の書式を一切検証していない列だった
 * （Zod は `z.array(z.string())`、DB CHECK は `jsonb_typeof = 'array'` のみ）。
 * つまり `""` や `"2026/01/01"` のような値が入っていても不思議ではない。
 *
 * **読めない値を黙って捨てない**ことがこのテストの主目的。捨てると
 * 「0 件だったので何もしなかった」と区別が付かず、移行し損ねたことに誰も気づけない。
 */

import { describe, expect, test } from "bun:test";

import {
  parseCalendarDate,
  planBackfill,
} from "../../../scripts/backfill-special-holidays-to-blocked-dates";

describe("特別休業日の移行計画", () => {
  test("YYYY-MM-DD だけを単日の休業として移す", () => {
    const { rows, skipped } = planBackfill([
      {
        id: "loc-1",
        slug: "shibuya",
        specialHolidays: ["2026-01-01", "2026-01-02"],
      },
      { id: "loc-2", slug: "shinjuku", specialHolidays: ["2026-12-31"] },
    ]);

    expect(rows).toEqual([
      { locationId: "loc-1", slug: "shibuya", date: "2026-01-01" },
      { locationId: "loc-1", slug: "shibuya", date: "2026-01-02" },
      { locationId: "loc-2", slug: "shinjuku", date: "2026-12-31" },
    ]);
    expect(skipped).toEqual([]);
  });

  test("null / 空配列は何も生まない（skip としても数えない）", () => {
    const { rows, skipped } = planBackfill([
      { id: "loc-1", slug: "a", specialHolidays: null },
      { id: "loc-2", slug: "b", specialHolidays: [] },
    ]);

    expect(rows).toEqual([]);
    expect(skipped).toEqual([]);
  });

  test("読めない値は捨てずに理由付きで報告する", () => {
    const { rows, skipped } = planBackfill([
      {
        id: "loc-1",
        slug: "shibuya",
        // 書式検証の無い列なので、実際にこの手の値が入りうる。
        specialHolidays: ["2026-01-01", "", "2026/01/02", 20260103, null],
      },
      { id: "loc-2", slug: "shinjuku", specialHolidays: { not: "an array" } },
    ]);

    expect(rows).toEqual([
      { locationId: "loc-1", slug: "shibuya", date: "2026-01-01" },
    ]);
    expect(skipped).toEqual([
      { slug: "shibuya", value: '""' },
      { slug: "shibuya", value: '"2026/01/02"' },
      { slug: "shibuya", value: "20260103" },
      { slug: "shibuya", value: "null" },
      { slug: "shinjuku", value: '{"not":"an array"}' },
    ]);
  });

  test("形は合っていても暦に無い日付は移さない（黙って別の日にしない）", () => {
    // `new Date("2026-02-30T00:00:00.000Z")` は例外を投げず **3 月 2 日**になる。
    // 形の検査だけ通すと、違う日を休業日にしたうえで誰も気づけない。
    // `2026-13-01` は Invalid Date になり、そのまま渡せばループ途中で落ちて
    // 「一部だけ入った」状態になる。
    const { rows, skipped } = planBackfill([
      {
        id: "loc-1",
        slug: "shibuya",
        specialHolidays: [
          "2026-02-30",
          "2026-13-01",
          "2026-02-29", // 2026 は閏年ではない
          "2026-00-10",
          "2026-01-32",
          "2028-02-29", // 2028 は閏年なので通る
        ],
      },
    ]);

    expect(rows).toEqual([
      { locationId: "loc-1", slug: "shibuya", date: "2028-02-29" },
    ]);
    expect(skipped.map((s) => s.value)).toEqual([
      '"2026-02-30"',
      '"2026-13-01"',
      '"2026-02-29"',
      '"2026-00-10"',
      '"2026-01-32"',
    ]);
  });
});

describe("parseCalendarDate", () => {
  test("実在する日付は UTC 深夜の Date になる（@db.Date の保持規約）", () => {
    expect(parseCalendarDate("2026-01-01")?.toISOString()).toBe(
      "2026-01-01T00:00:00.000Z",
    );
    expect(parseCalendarDate("2028-02-29")?.toISOString()).toBe(
      "2028-02-29T00:00:00.000Z",
    );
  });

  test("正規化で別の日になる値・Invalid Date になる値は null", () => {
    expect(parseCalendarDate("2026-02-30")).toBeNull();
    expect(parseCalendarDate("2026-13-01")).toBeNull();
    expect(parseCalendarDate("2026-1-1")).toBeNull();
    expect(parseCalendarDate("")).toBeNull();
  });
});
