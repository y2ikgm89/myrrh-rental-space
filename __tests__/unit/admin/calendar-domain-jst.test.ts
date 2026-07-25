import { describe, test, expect } from "bun:test";
import {
  calculateEventPosition,
  formatDateLabel,
  getCalendarDateRange,
  minutesSinceJstBusinessStart,
} from "@/admin/lib/calendar";
import type { CalendarEvent, BusinessHours } from "@/admin/lib/calendar";
import { formatJstDateString } from "@/shared/lib/date-format";

// Round-4 finding #6 の regression guard。
// Cloud Run (TZ=UTC) 上で `start.getHours()` は UTC 時刻を返すため、
// JST 想定の予約バー top position が 9h ずれる silent bug を封鎖する。
//
// これらのテストは host TZ が UTC でも JST でも同値を返すことを検証する。
// SSoT: `src/shared/lib/date-format.ts:getJstMinutesOfDay`
//       (Intl.DateTimeFormat "Asia/Tokyo" 固定)

const HOURS: BusinessHours = { startHour: 9, endHour: 21 };
const PIXELS_PER_HOUR = 60;

function makeEvent(startIso: string, endIso: string): CalendarEvent {
  return {
    id: "test-event",
    title: "test",
    spaceId: "space-1",
    spaceName: "Space",
    startTime: startIso,
    endTime: endIso,
    status: "CONFIRMED",
    totalPrice: null,
    notes: null,
    customerName: "test",
    customerEmail: "test@example.com",
    customerPhone: null,
  };
}

describe("calculateEventPosition — JST 固定 (host TZ 非依存)", () => {
  test("JST 10:00〜12:00 の予約は営業開始 (9:00) から 60px オフセット・120px 高さ", () => {
    // 2024-06-15 10:00 JST = 2024-06-15 01:00 UTC
    // 2024-06-15 12:00 JST = 2024-06-15 03:00 UTC
    const event = makeEvent(
      "2024-06-15T01:00:00.000Z",
      "2024-06-15T03:00:00.000Z",
    );
    const pos = calculateEventPosition(event, HOURS, PIXELS_PER_HOUR);
    // (10:00 - 9:00) * 60 = 60px top
    expect(pos.top).toBe(60);
    // (12:00 - 10:00) * 60 = 120px height
    expect(pos.height).toBe(120);
  });

  test("JST 深夜早朝 (UTC 前日) の予約も JST wall-clock で計算される", () => {
    // 2024-06-15 09:30 JST = 2024-06-15 00:30 UTC
    // 2024-06-15 11:00 JST = 2024-06-15 02:00 UTC
    // 素の `getHours()` が UTC を返すと startMinutes = 0*60+30 = 30、
    // 営業開始 (9:00=540 min) に clip されて top=0, duration=90 の誤値になる。
    const event = makeEvent(
      "2024-06-15T00:30:00.000Z",
      "2024-06-15T02:00:00.000Z",
    );
    const pos = calculateEventPosition(event, HOURS, PIXELS_PER_HOUR);
    // JST 09:30 は営業内 → top = (30/60)*60 = 30px
    expect(pos.top).toBe(30);
    // 90 分 = 90px
    expect(pos.height).toBe(90);
  });

  test("JST 深夜 (UTC 昼) の予約は営業時間外 → height=0", () => {
    // 2024-06-15 23:00 JST = 2024-06-15 14:00 UTC
    // 2024-06-16 01:00 JST = 2024-06-15 16:00 UTC
    // 営業 09:00〜21:00 の範囲外なので height=0 (layout から除外される)
    const event = makeEvent(
      "2024-06-15T14:00:00.000Z",
      "2024-06-15T16:00:00.000Z",
    );
    const pos = calculateEventPosition(event, HOURS, PIXELS_PER_HOUR);
    expect(pos.height).toBe(0);
  });
});

describe("minutesSinceJstBusinessStart — SSoT 統一後の behavior 保持", () => {
  test("JST 10:30 (now) は営業開始 (9:00) から 90 分後", () => {
    // 2024-06-15 10:30 JST = 2024-06-15 01:30 UTC
    const now = new Date("2024-06-15T01:30:00.000Z");
    expect(minutesSinceJstBusinessStart(now, HOURS)).toBe(90);
  });

  test("JST 08:00 (now) は営業開始前 → 負値 (-60)", () => {
    // 2024-06-15 08:00 JST = 2024-06-14 23:00 UTC
    const now = new Date("2024-06-14T23:00:00.000Z");
    expect(minutesSinceJstBusinessStart(now, HOURS)).toBe(-60);
  });
});

describe("getCalendarDateRange — JST 固定 (host TZ 非依存)", () => {
  // 2024-06-15 23:00 JST = 2024-06-15 14:00 UTC
  const jstEveningUtc = new Date("2024-06-15T14:00:00.000Z");
  // 2024-06-15 00:00 JST = 2024-06-14 15:00 UTC — UTC 日付は前日だが JST 同日
  const jstMidnightUtc = new Date("2024-06-14T15:00:00.000Z");

  test("day view: 同一 JST 日の Instant は host TZ に依存せず同じ start/end", () => {
    for (const anchor of [jstEveningUtc, jstMidnightUtc]) {
      const range = getCalendarDateRange(anchor, "day");
      expect(range.start.toISOString()).toBe("2024-06-14T15:00:00.000Z");
      expect(range.end.toISOString()).toBe("2024-06-15T15:00:00.000Z");
      expect(range.displayDates).toHaveLength(1);
      expect(formatJstDateString(range.displayDates[0] ?? anchor)).toBe(
        "2024-06-15",
      );
    }
  });

  test("week view: JST 2024-06-15 (土) は日曜始まりで 6/9〜6/15", () => {
    const range = getCalendarDateRange(jstEveningUtc, "week");
    expect(range.start.toISOString()).toBe("2024-06-08T15:00:00.000Z");
    expect(range.end.toISOString()).toBe("2024-06-15T15:00:00.000Z");
    expect(range.displayDates).toHaveLength(7);
    expect(formatJstDateString(range.displayDates[0] ?? jstEveningUtc)).toBe(
      "2024-06-09",
    );
    expect(formatJstDateString(range.displayDates[6] ?? jstEveningUtc)).toBe(
      "2024-06-15",
    );
  });

  test("month view: JST 2024-06 は前後パディング週を含む 5/26〜7/6", () => {
    const range = getCalendarDateRange(jstEveningUtc, "month");
    expect(range.start.toISOString()).toBe("2024-05-25T15:00:00.000Z");
    expect(range.end.toISOString()).toBe("2024-07-06T15:00:00.000Z");
    expect(formatJstDateString(range.displayDates[0] ?? jstEveningUtc)).toBe(
      "2024-05-26",
    );
    expect(
      formatJstDateString(range.displayDates.at(-1) ?? jstEveningUtc),
    ).toBe("2024-07-06");
    expect(range.displayDates).toHaveLength(42);
  });
});

describe("formatDateLabel — week range JST 固定", () => {
  test("week view: JST 2024-06-15 (土) のラベルは 6月9日 - 6月15日", () => {
    const anchor = new Date("2024-06-15T14:00:00.000Z");
    expect(formatDateLabel(anchor, "week")).toBe("6月9日 - 6月15日");
  });
});
