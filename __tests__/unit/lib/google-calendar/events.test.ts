/**
 * google-calendar/events.ts の buildEventBody / 冪等 insert ユニットテスト
 *
 * Settings.googleCalendarMeetEnabled（site-wide トグル）は Prisma schema から DROP 済み
 * （Task 1）。Google Meet 発行判定は呼出元が渡す `options.withMeet` のみで行う
 * per-event 方式。`reminderMinutes` は DTO 注入（domain Settings 非依存）。
 */
import { describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockLogError = mock(() => undefined);
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM", LOW: "LOW" },
}));

import {
  buildEventBody,
  buildGoogleCalendarEventId,
  createCalendarEvent,
} from "@/shared/lib/google-calendar/events";
import type {
  CalendarEventParams,
  GoogleCalendarEventWriteContext,
} from "@/shared/lib/google-calendar/types";

const RESERVATION_UUID = "01234567-89ab-7cde-89ab-0123456789ab";

const baseParams: CalendarEventParams = {
  id: "r0123456789ab7cde89ab0123456789ab",
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
    expect(result.conferenceData?.createRequest?.requestId).toBe(baseParams.id);
  });

  test("requestBody.id は params.id をそのまま載せる", () => {
    const result = buildEventBody(baseParams, null, { withMeet: false });
    expect(result.id).toBe(baseParams.id);
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

describe("buildGoogleCalendarEventId", () => {
  test("予約 / series / slot は base32hex 適合の決定論 ID になる", () => {
    expect(buildGoogleCalendarEventId("reservation", RESERVATION_UUID)).toBe(
      "r0123456789ab7cde89ab0123456789ab",
    );
    expect(
      buildGoogleCalendarEventId("reservationSeries", RESERVATION_UUID),
    ).toBe("s0123456789ab7cde89ab0123456789ab");
    expect(buildGoogleCalendarEventId("eventSlot", RESERVATION_UUID)).toBe(
      "t0123456789ab7cde89ab0123456789ab",
    );
  });

  test("UUID 以外は hex 符号化して決定論 ID になる", () => {
    expect(buildGoogleCalendarEventId("reservation", "res-001")).toBe(
      `r${Buffer.from("res-001", "utf8").toString("hex")}`,
    );
  });

  test("短すぎる source id は拒否する", () => {
    expect(() => buildGoogleCalendarEventId("reservation", "")).toThrow();
  });
});

describe("createCalendarEvent", () => {
  test("409 duplicate は既存イベントを get して成功扱い", async () => {
    const existing = {
      id: baseParams.id,
      htmlLink: "https://calendar.google.com/event?eid=abc",
    };
    const insert = mock(() =>
      Promise.reject({
        code: 409,
        errors: [{ domain: "global", reason: "duplicate" }],
      }),
    );
    const get = mock(() => Promise.resolve({ data: existing }));
    const ctx: GoogleCalendarEventWriteContext = {
      client: { events: { insert, get } } as never,
      calendarId: "cal-1",
      reminderMinutes: null,
    };

    const result = await createCalendarEvent(ctx, baseParams);

    expect(result.success).toBe(true);
    expect(result.eventId).toBe(baseParams.id);
    expect(result.eventUrl).toBe(existing.htmlLink);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);
  });
});
