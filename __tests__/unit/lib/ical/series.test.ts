/**
 * `buildReservationSeriesCalendar` / `buildReservationSeriesCancelCalendar` の
 * unit test（Phase B.2 task 15）。
 *
 * 検証観点:
 *
 *   1. master UID は `reservation-series-<seriesId>@<host>` 形式で単一化される
 *      (各 instance ではなく series 全体で 1 つ、RFC 5545 recurring event 契約)。
 *   2. `event.repeating(rrule)` により RRULE 行が ICS 内に出力される
 *      (VTIMEZONE ではなく VEVENT 直下、`RRULE:FREQ=...` prefix 自動付与)。
 *   3. dtstart + duration の VEVENT が 1 つだけ出力される
 *      (RFC 5545 recurring master は「1 VEVENT + RRULE」パターン、EXDATE / RDATE 未使用)。
 *   4. CANCEL 版は METHOD:CANCEL + status CANCELLED + 同じ UID
 *      (受信側カレンダーが master + 全 occurrence を連動削除する契約)。
 */

import { describe, expect, test } from "bun:test";

import {
  buildReservationSeriesCalendar,
  buildReservationSeriesCancelCalendar,
  buildReservationSeriesUid,
} from "@/shared/lib/ical";

const HOST = "example.com";

const BASE_PARAMS = {
  seriesId: "series-abc",
  spaceName: "Room A",
  customerName: "山田 太郎",
  rrule: "FREQ=WEEKLY;BYDAY=TU;COUNT=10",
  dtstart: new Date("2027-05-04T10:00:00.000Z"),
  duration: 120,
  sequence: 0,
} as const;

describe("buildReservationSeriesUid", () => {
  test("`reservation-series-<id>@<host>` 形式", () => {
    expect(buildReservationSeriesUid("abc-123", "example.com")).toBe(
      "reservation-series-abc-123@example.com",
    );
  });

  test("host が空なら fallback (localhost)", () => {
    expect(buildReservationSeriesUid("abc-123", "  ")).toBe(
      "reservation-series-abc-123@localhost",
    );
  });
});

describe("buildReservationSeriesCalendar", () => {
  test("master UID + RRULE + METHOD:REQUEST が出力される", () => {
    const ics = buildReservationSeriesCalendar(BASE_PARAMS, HOST);

    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("UID:reservation-series-series-abc@example.com");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10");
    // 1 VEVENT のみ (VEVENT の開始行が 1 回だけ現れる)
    const veventOpenings = ics.match(/BEGIN:VEVENT/g);
    expect(veventOpenings).not.toBeNull();
    expect(veventOpenings?.length).toBe(1);
  });

  test("dtstart + endTime (dtstart + duration 分) が VEVENT に反映される", () => {
    const ics = buildReservationSeriesCalendar(BASE_PARAMS, HOST);
    // 2027-05-04T10:00:00Z → DTSTART:20270504T100000Z
    // duration=120 → DTEND:20270504T120000Z
    expect(ics).toContain("DTSTART:20270504T100000Z");
    expect(ics).toContain("DTEND:20270504T120000Z");
  });

  test("SUMMARY / DESCRIPTION に space + customer が反映される", () => {
    const ics = buildReservationSeriesCalendar(BASE_PARAMS, HOST);
    expect(ics).toContain("SUMMARY:【定期予約】Room A");
    expect(ics).toMatch(/DESCRIPTION:.*Room A/);
  });

  test("location / organizer が指定されれば出力に含まれる", () => {
    const ics = buildReservationSeriesCalendar(
      {
        ...BASE_PARAMS,
        location: "東京都テスト区1-2-3",
        organizerName: "Myrrh",
        organizerEmail: "no-reply@example.com",
      },
      HOST,
    );
    expect(ics).toContain("LOCATION:");
    expect(ics).toContain("東京都テスト区1-2-3");
    expect(ics).toContain("ORGANIZER");
    expect(ics).toContain("no-reply@example.com");
  });
});

describe("buildReservationSeriesCancelCalendar", () => {
  test("METHOD:CANCEL + STATUS:CANCELLED + 同じ UID (master)", () => {
    const ics = buildReservationSeriesCancelCalendar(BASE_PARAMS, HOST);

    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("UID:reservation-series-series-abc@example.com");
    // CANCEL でも master であるため RRULE は保持 (受信側で master + 全 occurrence 連動削除)
    expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=10");
  });

  test("SUMMARY は【キャンセル】prefix", () => {
    const ics = buildReservationSeriesCancelCalendar(BASE_PARAMS, HOST);
    expect(ics).toContain("SUMMARY:【定期予約キャンセル】Room A");
  });

  test("sequence を bump できる", () => {
    const ics = buildReservationSeriesCancelCalendar(
      { ...BASE_PARAMS, sequence: 3 },
      HOST,
    );
    expect(ics).toContain("SEQUENCE:3");
  });
});
