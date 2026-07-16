/**
 * google-calendar/events.ts の buildEventBody ユニットテスト（Phase B.1 task 7）
 *
 * Settings.googleCalendarMeetEnabled（site-wide トグル）は Prisma schema から DROP 済み
 * （Task 1）。Google Meet 発行判定は呼出元が渡す `options.withMeet` のみで行う
 * per-event 方式に置換する（`GoogleCalendarSettingsData` から `meetEnabled` 削除後も
 * buildEventBody が正しく動作することを固定する回帰テスト）。
 */
import { describe, test, expect } from "bun:test";
import { buildEventBody } from "@/shared/lib/google-calendar/events";
import type { CalendarEventParams } from "@/shared/lib/google-calendar/types";
import type { GoogleCalendarSettingsData } from "@/shared/domain/settings/types";

const baseParams: CalendarEventParams = {
  summary: "テストイベント",
  description: "説明文",
  startTime: new Date("2026-08-01T10:00:00+09:00"),
  endTime: new Date("2026-08-01T11:00:00+09:00"),
};

// meetEnabled フィールドを持たない（削除済み）GoogleCalendarSettingsData。
// この型で受け付けられること自体が「settings 側に Meet トグルが存在しない」ことの証明。
const baseSettings: GoogleCalendarSettingsData = {
  enabled: true,
  calendarId: "primary",
  connectionStatus: null,
  lastTestedAt: null,
  reminderMinutes: null,
};

describe("buildEventBody (Phase B.1 task 7)", () => {
  test("withMeet: false → conferenceData 出さない", () => {
    const result = buildEventBody(baseParams, baseSettings, {
      withMeet: false,
    });
    expect(result.conferenceData).toBeUndefined();
  });

  test("withMeet 未指定 → conferenceData 出さない（デフォルト false 相当）", () => {
    const result = buildEventBody(baseParams, baseSettings, {
      includeAttendee: true,
    });
    expect(result.conferenceData).toBeUndefined();
  });

  test("withMeet: true → conferenceData.createRequest 出す", () => {
    const result = buildEventBody(baseParams, baseSettings, {
      withMeet: true,
    });
    expect(
      result.conferenceData?.createRequest?.conferenceSolutionKey?.type,
    ).toBe("hangoutsMeet");
    expect(result.conferenceData?.createRequest?.requestId).toBeTruthy();
  });

  test("settings の内容に関わらず options.withMeet のみで判定する（settings.meetEnabled は既に削除済 field で参照不能）", () => {
    // enabled/calendarId/connectionStatus/reminderMinutes を全て変えても、
    // withMeet の判定（conferenceData の有無）には一切影響しないことを固定する。
    const altSettings: GoogleCalendarSettingsData = {
      enabled: false,
      calendarId: null,
      connectionStatus: "error",
      lastTestedAt: new Date("2020-01-01T00:00:00Z"),
      reminderMinutes: 30,
    };

    const withMeetTrue = buildEventBody(baseParams, altSettings, {
      withMeet: true,
    });
    expect(
      withMeetTrue.conferenceData?.createRequest?.conferenceSolutionKey?.type,
    ).toBe("hangoutsMeet");

    const withMeetFalse = buildEventBody(baseParams, altSettings, {
      withMeet: false,
    });
    expect(withMeetFalse.conferenceData).toBeUndefined();
  });

  test("reminders は settings.reminderMinutes を反映する（withMeet 判定とは独立）", () => {
    const result = buildEventBody(
      baseParams,
      { ...baseSettings, reminderMinutes: 15 },
      { withMeet: false },
    );
    expect(result.reminders).toEqual({
      useDefault: false,
      overrides: [{ method: "email", minutes: 15 }],
    });
  });

  test("includeAttendee: true + attendeeEmail あり → attendees に含める", () => {
    const result = buildEventBody(
      { ...baseParams, attendeeEmail: "guest@example.com" },
      baseSettings,
      { includeAttendee: true, withMeet: false },
    );
    expect(result.attendees).toEqual([{ email: "guest@example.com" }]);
  });
});
