import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { calendar_v3 } from "googleapis";

// =============================================================================
// Mock helpers BEFORE importing the SUT
// =============================================================================

const mockIsEnabled = mock<() => Promise<boolean>>(() => Promise.resolve(true));
const mockCreate = mock<
  (
    params: unknown,
    options?: { withMeet?: boolean },
  ) => Promise<{
    success: boolean;
    eventId?: string;
    error?: string;
    event?: calendar_v3.Schema$Event;
  }>
>(() => Promise.resolve({ success: true, eventId: "gcal-event-123" }));
const mockUpdate = mock<
  () => Promise<{ success: boolean; eventId?: string; error?: string }>
>(() => Promise.resolve({ success: true }));
const mockDelete = mock<() => Promise<{ success: boolean; error?: string }>>(
  () => Promise.resolve({ success: true }),
);

mock.module("@/shared/lib/google-calendar", () => ({
  isGoogleCalendarEnabled: mockIsEnabled,
  createCalendarEvent: mockCreate,
  updateCalendarEvent: mockUpdate,
  deleteCalendarEvent: mockDelete,
  // 他の export もスタブで返す（テスト汚染防止）
  getCalendarEvent: mock(() => Promise.resolve(null)),
  getServiceAccountClient: mock(() => Promise.resolve(null)),
  encryptServiceAccountJson: mock(() => Promise.resolve("")),
  extractServiceAccountEmail: mock(() => ""),
  fetchCalendarChanges: mock(() => Promise.resolve({ items: [] })),
  setupWebhookWatch: mock(() => Promise.resolve({ success: false })),
  stopWebhookWatch: mock(() => Promise.resolve()),
  renewWebhookIfNeeded: mock(() => Promise.resolve({ renewed: false })),
  testServiceAccountConnection: mock(() => Promise.resolve({ success: false })),
  isTwoWaySyncEnabled: mock(() => Promise.resolve(false)),
  isValidCalendarId: mock(() => Promise.resolve(false)),
  formatGoogleApiError: mock((e: unknown) => String(e)),
}));

const mockSave = mock<() => Promise<void>>(() => Promise.resolve());
const mockClear = mock<() => Promise<void>>(() => Promise.resolve());
const mockMarkError = mock<() => Promise<void>>(() => Promise.resolve());
const mockGetForSync = mock<() => Promise<unknown>>(() =>
  Promise.resolve(null),
);
const mockWriteBackMeetingUrl = mock<
  (params: { eventId: string; meetingUrl: string }) => Promise<void>
>(() => Promise.resolve());

mock.module("@/shared/domain/events/calendar-sync", () => ({
  saveEventGoogleCalendarEventId: mockSave,
  clearEventGoogleCalendarEventId: mockClear,
  markEventCalendarSyncError: mockMarkError,
  getEventSlotsForCalendarSync: mockGetForSync,
  writeBackMeetingUrl: mockWriteBackMeetingUrl,
}));

// =============================================================================
// Import SUT (after mocks)
// =============================================================================

import {
  syncEventToCalendar,
  updateEventCalendarSync,
  deleteEventCalendarSync,
} from "@/shared/lib/calendar-sync/event-outbound";
import type { EventSyncData } from "@/shared/lib/calendar-sync/types";

// =============================================================================
// Test fixtures
// =============================================================================

const baseEventData: EventSyncData = {
  eventId: "event-id-001",
  slotId: "slot-id-001",
  title: "テストイベント",
  descriptionPlainText: "イベントの説明文です。",
  startTime: new Date("2026-05-01T10:00:00+09:00"),
  endTime: new Date("2026-05-01T12:00:00+09:00"),
  location: "東京都渋谷区 / テストスペース",
  publicUrl: "https://example.com/events/test-event",
  meetingProvider: "MANUAL",
};

// =============================================================================
// Tests
// =============================================================================

describe("syncEventToCalendar", () => {
  beforeEach(() => {
    mockIsEnabled.mockClear();
    mockCreate.mockClear();
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: true, eventId: "gcal-event-123" }),
    );
    mockUpdate.mockClear();
    mockDelete.mockClear();
    mockSave.mockClear();
    mockClear.mockClear();
    mockMarkError.mockClear();
    mockWriteBackMeetingUrl.mockClear();
  });

  test("GCal disabled → no-op { success: true }", async () => {
    mockIsEnabled.mockImplementation(() => Promise.resolve(false));

    const result = await syncEventToCalendar(baseEventData);

    expect(result).toEqual({ success: true });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockSave).not.toHaveBeenCalled();
  });

  test("GCal enabled → createCalendarEvent 呼び出し + saveEventGoogleCalendarEventId 呼び出し", async () => {
    mockIsEnabled.mockImplementation(() => Promise.resolve(true));
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: true, eventId: "gcal-event-abc" }),
    );

    const result = await syncEventToCalendar(baseEventData);

    expect(result).toEqual({ success: true, eventId: "gcal-event-abc" });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(
      expect.objectContaining({
        slotId: "slot-id-001",
        googleCalendarEventId: "gcal-event-abc",
      }),
    );
  });

  test("createCalendarEvent 失敗 → markEventCalendarSyncError 呼び出し + { success: false, error }", async () => {
    mockIsEnabled.mockImplementation(() => Promise.resolve(true));
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: false, error: "API quota exceeded" }),
    );

    const result = await syncEventToCalendar(baseEventData);

    expect(result.success).toBe(false);
    expect(result.error).toBe("API quota exceeded");
    expect(mockMarkError).toHaveBeenCalledTimes(1);
    expect(mockMarkError).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-id-001",
        error: "API quota exceeded",
      }),
    );
    expect(mockSave).not.toHaveBeenCalled();
  });

  test("formatCalendarEvent が description 1行目に「イベントID: ${eventId}」を含む", async () => {
    mockIsEnabled.mockImplementation(() => Promise.resolve(true));
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: true, eventId: "gcal-event-xyz" }),
    );

    await syncEventToCalendar(baseEventData);

    // description の先頭行に inbound ループ防止キーが含まれることを検証
    // (第2引数は withMeet オプション — Phase B.1 task 8 で createCalendarEvent が
    // 常に2引数で呼ばれるようになったため expect.any(Object) で受ける)
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringContaining(
          `イベントID: ${baseEventData.eventId}`,
        ),
      }),
      expect.any(Object),
    );
    // かつ description の分割結果で先頭行を確認
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        description: expect.stringMatching(
          new RegExp(`^イベントID: ${baseEventData.eventId}`),
        ),
      }),
      expect.any(Object),
    );
  });

  test("formatCalendarEvent が attendeeEmail を含まない（attendees 未使用）", async () => {
    mockIsEnabled.mockImplementation(() => Promise.resolve(true));
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: true, eventId: "gcal-event-xyz" }),
    );

    await syncEventToCalendar(baseEventData);

    // attendeeEmail は omitUndefined により存在しない（undefined プロパティは除去される）
    expect(mockCreate).not.toHaveBeenCalledWith(
      expect.objectContaining({ attendeeEmail: expect.anything() }),
      expect.any(Object),
    );
  });

  // ===========================================================================
  // Phase B.1 task 8: withMeet 判定 + Meet URL write-back
  // ===========================================================================

  test("meetingProvider=MANUAL → createCalendarEvent に withMeet:false を渡し、writeBackMeetingUrl は呼ばれない", async () => {
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: true, eventId: "gcal-manual-1" }),
    );

    await syncEventToCalendar({ ...baseEventData, meetingProvider: "MANUAL" });

    expect(mockCreate).toHaveBeenCalledWith(expect.any(Object), {
      withMeet: false,
    });
    expect(mockWriteBackMeetingUrl).not.toHaveBeenCalled();
  });

  test("meetingProvider=GOOGLE_MEET → createCalendarEvent に withMeet:true を渡す", async () => {
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: true, eventId: "gcal-meet-1" }),
    );

    await syncEventToCalendar({
      ...baseEventData,
      meetingProvider: "GOOGLE_MEET",
    });

    expect(mockCreate).toHaveBeenCalledWith(expect.any(Object), {
      withMeet: true,
    });
  });

  test("GOOGLE_MEET + hangoutLink 応答 → writeBackMeetingUrl(eventId, hangoutLink) を呼ぶ", async () => {
    mockCreate.mockImplementation(() =>
      Promise.resolve({
        success: true,
        eventId: "gcal-meet-2",
        event: { hangoutLink: "https://meet.google.com/abc-defg-hij" },
      }),
    );

    await syncEventToCalendar({
      ...baseEventData,
      meetingProvider: "GOOGLE_MEET",
    });

    expect(mockWriteBackMeetingUrl).toHaveBeenCalledTimes(1);
    expect(mockWriteBackMeetingUrl).toHaveBeenCalledWith({
      eventId: baseEventData.eventId,
      meetingUrl: "https://meet.google.com/abc-defg-hij",
    });
  });

  test("GOOGLE_MEET + hangoutLink 無し + conferenceData.entryPoints[video] あり → その uri を write-back する", async () => {
    mockCreate.mockImplementation(() =>
      Promise.resolve({
        success: true,
        eventId: "gcal-meet-3",
        event: {
          conferenceData: {
            entryPoints: [
              { entryPointType: "phone", uri: "tel:+81-3-0000-0000" },
              {
                entryPointType: "video",
                uri: "https://meet.google.com/fallback-uri",
              },
            ],
          },
        },
      }),
    );

    await syncEventToCalendar({
      ...baseEventData,
      meetingProvider: "GOOGLE_MEET",
    });

    expect(mockWriteBackMeetingUrl).toHaveBeenCalledWith({
      eventId: baseEventData.eventId,
      meetingUrl: "https://meet.google.com/fallback-uri",
    });
  });

  test("GOOGLE_MEET だが hangoutLink も conferenceData も無い → writeBackMeetingUrl は呼ばれない", async () => {
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: true, eventId: "gcal-meet-4" }),
    );

    await syncEventToCalendar({
      ...baseEventData,
      meetingProvider: "GOOGLE_MEET",
    });

    expect(mockWriteBackMeetingUrl).not.toHaveBeenCalled();
  });

  test("GOOGLE_MEET だが createCalendarEvent 失敗 → writeBackMeetingUrl は呼ばれない", async () => {
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: false, error: "quota exceeded" }),
    );

    const result = await syncEventToCalendar({
      ...baseEventData,
      meetingProvider: "GOOGLE_MEET",
    });

    expect(result.success).toBe(false);
    expect(mockWriteBackMeetingUrl).not.toHaveBeenCalled();
  });
});

describe("updateEventCalendarSync", () => {
  beforeEach(() => {
    mockIsEnabled.mockClear();
    mockUpdate.mockClear();
    mockSave.mockClear();
    mockMarkError.mockClear();
  });

  test("updateCalendarEvent(existingEventId, ...) 呼び出し", async () => {
    mockIsEnabled.mockImplementation(() => Promise.resolve(true));
    mockUpdate.mockImplementation(() => Promise.resolve({ success: true }));

    const result = await updateEventCalendarSync(
      baseEventData,
      "existing-gcal-id",
    );

    expect(result).toEqual({ success: true, eventId: "existing-gcal-id" });
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).toHaveBeenCalledWith(
      "existing-gcal-id",
      expect.objectContaining({
        summary: baseEventData.title,
      }),
    );
  });

  test("GCal disabled → no-op { success: true }", async () => {
    mockIsEnabled.mockImplementation(() => Promise.resolve(false));

    const result = await updateEventCalendarSync(
      baseEventData,
      "existing-gcal-id",
    );

    expect(result).toEqual({ success: true });
    expect(mockUpdate).not.toHaveBeenCalled();
  });
});

describe("deleteEventCalendarSync", () => {
  beforeEach(() => {
    mockIsEnabled.mockClear();
    mockDelete.mockClear();
    mockClear.mockClear();
    mockMarkError.mockClear();
  });

  test("deleteCalendarEvent(gcalEventId) 呼び出し + clearEventGoogleCalendarEventId 呼び出し", async () => {
    mockIsEnabled.mockImplementation(() => Promise.resolve(true));
    mockDelete.mockImplementation(() => Promise.resolve({ success: true }));

    const result = await deleteEventCalendarSync(
      "event-id-001",
      "gcal-event-to-delete",
    );

    expect(result).toEqual({ success: true });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith("gcal-event-to-delete");
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalledWith(
      expect.objectContaining({
        googleCalendarEventId: "gcal-event-to-delete",
      }),
    );
  });

  test("GCal disabled → no-op { success: true }", async () => {
    mockIsEnabled.mockImplementation(() => Promise.resolve(false));

    const result = await deleteEventCalendarSync(
      "event-id-001",
      "gcal-event-to-delete",
    );

    expect(result).toEqual({ success: true });
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  });
});
