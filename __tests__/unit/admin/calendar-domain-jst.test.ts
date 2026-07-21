import { describe, test, expect } from "bun:test";
import {
  calculateEventPosition,
  minutesSinceJstBusinessStart,
} from "@/admin/lib/calendar";
import type { CalendarEvent, BusinessHours } from "@/admin/lib/calendar";

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
