/**
 * google-calendar/events.ts の buildEventBody ユニットテスト（Phase B.1 task 7）
 *
 * Settings.googleCalendarMeetEnabled（site-wide トグル）は Prisma schema から DROP 済み
 * （Task 1）。Google Meet 発行判定は呼出元が渡す `options.withMeet` のみで行う
 * per-event 方式。`reminderMinutes` は DTO 注入（domain Settings 非依存）。
 */
import { describe, test, expect } from "bun:test";
import { buildEventBody } from "@/shared/lib/google-calendar/events";
import type { CalendarEventParams } from "@/shared/lib/google-calendar/types";

const baseParams: CalendarEventParams = {
  summary: "テストイベント",
  description: "説明文",
  startTime: new Date("2026-08-01T10:00:00+09:00"),
  endTime: new Date("2026-08-01T11:00:00+09:00"),
};

describe("buildEventBody (Phase B.1 task 7)", () => {
  test("withMeet: false → conferenceData 出さない", () => {
    const result = buildEventBody(baseParams, null, {
      withMeet: false,
    });
    expect(result.conferenceData).toBeUndefined();
  });

  test("withMeet 未指定 → conferenceData 出さない（デフォルト false 相当）", () => {
    const result = buildEventBody(baseParams, null, {});
    expect(result.conferenceData).toBeUndefined();
  });

  test("withMeet: true → conferenceData.createRequest 出す", () => {
    const result = buildEventBody(baseParams, null, {
      withMeet: true,
    });
    expect(
      result.conferenceData?.createRequest?.conferenceSolutionKey?.type,
    ).toBe("hangoutsMeet");
    expect(result.conferenceData?.createRequest?.requestId).toBeTruthy();
  });

  test("reminderMinutes の内容に関わらず options.withMeet のみで判定する", () => {
    const withMeetTrue = buildEventBody(baseParams, 30, {
      withMeet: true,
    });
    expect(
      withMeetTrue.conferenceData?.createRequest?.conferenceSolutionKey?.type,
    ).toBe("hangoutsMeet");

    const withMeetFalse = buildEventBody(baseParams, 30, {
      withMeet: false,
    });
    expect(withMeetFalse.conferenceData).toBeUndefined();
  });

  test("reminders は reminderMinutes を反映する（withMeet 判定とは独立）", () => {
    const result = buildEventBody(baseParams, 15, { withMeet: false });
    expect(result.reminders).toEqual({
      useDefault: false,
      overrides: [{ method: "email", minutes: 15 }],
    });
  });

  test("attendees は常に含めない（サービスアカウントは attendee 設定不可）", () => {
    const result = buildEventBody(baseParams, null, {
      withMeet: false,
    });
    expect(result.attendees).toBeUndefined();
  });
});
