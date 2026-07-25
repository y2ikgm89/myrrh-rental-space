import { describe, test, expect } from "bun:test";
import {
  filterBarsWithinDisplayPeriodNow,
  isWithinDisplayPeriod,
} from "@/public/components/announcement-bar/display-period";

const NOW = new Date("2026-07-22T12:00:00.000Z");

describe("isWithinDisplayPeriod", () => {
  test("startAt/endAt がいずれも無ければ常に true", () => {
    expect(isWithinDisplayPeriod({ startAt: null, endAt: null }, NOW)).toBe(
      true,
    );
  });

  test("startAt のみ指定: now が startAt 以降なら true", () => {
    expect(
      isWithinDisplayPeriod(
        { startAt: "2026-07-22T11:00:00.000Z", endAt: null },
        NOW,
      ),
    ).toBe(true);
  });

  test("startAt のみ指定: now が startAt より前なら false", () => {
    expect(
      isWithinDisplayPeriod(
        { startAt: "2026-07-22T13:00:00.000Z", endAt: null },
        NOW,
      ),
    ).toBe(false);
  });

  test("endAt のみ指定: now が endAt 以前なら true", () => {
    expect(
      isWithinDisplayPeriod(
        { startAt: null, endAt: "2026-07-22T13:00:00.000Z" },
        NOW,
      ),
    ).toBe(true);
  });

  test("endAt のみ指定: now が endAt を過ぎていれば false", () => {
    expect(
      isWithinDisplayPeriod(
        { startAt: null, endAt: "2026-07-22T11:00:00.000Z" },
        NOW,
      ),
    ).toBe(false);
  });

  test("startAt/endAt 両方指定: 期間内なら true", () => {
    expect(
      isWithinDisplayPeriod(
        {
          startAt: "2026-07-22T11:00:00.000Z",
          endAt: "2026-07-22T13:00:00.000Z",
        },
        NOW,
      ),
    ).toBe(true);
  });

  test("startAt/endAt 両方指定: 期間外(開始前)なら false", () => {
    expect(
      isWithinDisplayPeriod(
        {
          startAt: "2026-07-22T13:00:00.000Z",
          endAt: "2026-07-22T14:00:00.000Z",
        },
        NOW,
      ),
    ).toBe(false);
  });

  test("startAt/endAt 両方指定: 期間外(終了後)なら false", () => {
    expect(
      isWithinDisplayPeriod(
        {
          startAt: "2026-07-22T09:00:00.000Z",
          endAt: "2026-07-22T11:00:00.000Z",
        },
        NOW,
      ),
    ).toBe(false);
  });

  test("境界値: now === startAt は true（inclusive）", () => {
    expect(
      isWithinDisplayPeriod({ startAt: NOW.toISOString(), endAt: null }, NOW),
    ).toBe(true);
  });

  test("境界値: now === endAt は true（inclusive）", () => {
    expect(
      isWithinDisplayPeriod({ startAt: null, endAt: NOW.toISOString() }, NOW),
    ).toBe(true);
  });
});

describe("filterBarsWithinDisplayPeriodNow", () => {
  test("期間内の bar のみ返す", () => {
    const bars = [
      { id: "a", startAt: null, endAt: null },
      {
        id: "b",
        startAt: "2099-01-01T00:00:00.000Z",
        endAt: null,
      },
    ];
    const filtered = filterBarsWithinDisplayPeriodNow(bars);
    expect(filtered.map((bar) => bar.id)).toEqual(["a"]);
  });
});
