import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { calendar_v3 } from "googleapis";

// =============================================================================
// Mock helpers BEFORE importing the SUT
// =============================================================================

const mockIsEnabled = mock<() => Promise<boolean>>(() => Promise.resolve(true));
const mockIsConfigured = mock<() => Promise<boolean>>(() =>
  Promise.resolve(true),
);
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
  isGoogleCalendarConfigured: mockIsConfigured,
  createCalendarEvent: mockCreate,
  updateCalendarEvent: mockUpdate,
  deleteCalendarEvent: mockDelete,
  // 他の export もスタブで返す（テスト汚染防止）
  getCalendarEvent: mock(() => Promise.resolve(null)),
  // Phase B.2 task 16 で追加された fetchEventInstances。outbound.ts が
  // syncReservationSeriesToCalendar 経由で import するため mock stub 必須
  // (未追加時に SyntaxError: Export named 'fetchEventInstances' not found)。
  fetchEventInstances: mock(() =>
    Promise.resolve({ success: true, instances: [] }),
  ),
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

const mockSave = mock<(...args: unknown[]) => Promise<void>>(() =>
  Promise.resolve(),
);
const mockClear = mock<() => Promise<void>>(() => Promise.resolve());
const mockMarkError = mock<(...args: unknown[]) => Promise<void>>(() =>
  Promise.resolve(),
);
const mockMarkSuccess = mock<(...args: unknown[]) => Promise<void>>(() =>
  Promise.resolve(),
);
const mockGetFailedEventIds = mock<() => Promise<string[]>>(() =>
  Promise.resolve([]),
);
const mockGetForSync = mock<(...args: unknown[]) => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockGetGcalIdsForDelete = mock<(eventId: string) => Promise<string[]>>(
  () => Promise.resolve([]),
);
const mockGetEventCalendarSyncError = mock<
  (eventId: string) => Promise<string | null>
>(() => Promise.resolve(null));
const mockWriteBackMeetingUrl = mock<
  (params: { eventId: string; meetingUrl: string }) => Promise<void>
>(() => Promise.resolve());

mock.module("@/shared/domain/events/calendar-sync", () => ({
  saveEventGoogleCalendarEventId: mockSave,
  clearEventGoogleCalendarEventId: mockClear,
  markEventCalendarSyncError: mockMarkError,
  markEventCalendarSyncSuccess: mockMarkSuccess,
  getFailedCalendarSyncEventIds: mockGetFailedEventIds,
  getEventSlotsForCalendarSync: mockGetForSync,
  getEventGoogleCalendarEventIdsForDelete: mockGetGcalIdsForDelete,
  getEventCalendarSyncError: mockGetEventCalendarSyncError,
  writeBackMeetingUrl: mockWriteBackMeetingUrl,
  GCAL_DELETE_FAILED_PREFIX: "gcal_delete_failed:",
}));

// =============================================================================
// Import SUT (after mocks)
// =============================================================================

import {
  syncEventToCalendar,
  updateEventCalendarSync,
  deleteEventCalendarSync,
  retryFailedEventCalendarSyncs,
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
    mockDelete.mockReset();
    mockDelete.mockImplementation(() => Promise.resolve({ success: true }));
    mockSave.mockReset();
    mockSave.mockImplementation(() => Promise.resolve());
    mockClear.mockClear();
    mockMarkError.mockClear();
    mockWriteBackMeetingUrl.mockReset();
    mockWriteBackMeetingUrl.mockImplementation(() => Promise.resolve());
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

  test("formatCalendarEvent が attendees を含まない", async () => {
    mockIsEnabled.mockImplementation(() => Promise.resolve(true));
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: true, eventId: "gcal-event-xyz" }),
    );

    await syncEventToCalendar(baseEventData);

    const call = mockCreate.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call).not.toHaveProperty("attendees");
    expect(call).not.toHaveProperty("attendeeEmail");
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

  test("GOOGLE_MEET だが hangoutLink も conferenceData も無い → writeBackMeetingUrl は呼ばれず、markEventCalendarSyncError で可視化される (GCAL-OUTBOUND-06)", async () => {
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: true, eventId: "gcal-meet-4" }),
    );

    const result = await syncEventToCalendar({
      ...baseEventData,
      meetingProvider: "GOOGLE_MEET",
    });

    expect(mockWriteBackMeetingUrl).not.toHaveBeenCalled();
    // GCAL-OUTBOUND-06: Meet URL 未発行は silent 成功にしない。
    // GCal event 自体の作成は成功しているため sync 全体は success:true のまま。
    expect(result).toEqual({ success: true, eventId: "gcal-meet-4" });
    expect(mockMarkError).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: baseEventData.eventId,
        error: expect.stringContaining("Meet URL was not returned"),
      }),
    );
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

  // ===========================================================================
  // GCAL-AUDIT-04: Meet write-back 失敗は calendarSyncError に記録する (silent 成功禁止)
  // ===========================================================================

  test("GOOGLE_MEET + writeBackMeetingUrl 失敗 → markEventCalendarSyncError を呼ぶが sync 自体は success", async () => {
    mockCreate.mockImplementation(() =>
      Promise.resolve({
        success: true,
        eventId: "gcal-meet-5",
        event: { hangoutLink: "https://meet.google.com/broken" },
      }),
    );
    mockWriteBackMeetingUrl.mockImplementation(() =>
      Promise.reject(new Error("DB unavailable")),
    );

    const result = await syncEventToCalendar({
      ...baseEventData,
      meetingProvider: "GOOGLE_MEET",
    });

    expect(result).toEqual({ success: true, eventId: "gcal-meet-5" });
    expect(mockMarkError).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: baseEventData.eventId,
        error: expect.stringContaining("Meet URL write-back failed"),
      }),
    );
  });

  // ===========================================================================
  // GCAL-AUDIT-07: create 成功 + DB write-back 失敗 → 補償削除 + エラー記録
  // ===========================================================================

  test("saveEventGoogleCalendarEventId が失敗 → 作成済み GCal event を削除し失敗として返す", async () => {
    mockCreate.mockImplementation(() =>
      Promise.resolve({ success: true, eventId: "gcal-event-orphan" }),
    );
    mockSave.mockImplementation(() =>
      Promise.reject(new Error("DB connection lost")),
    );

    const result = await syncEventToCalendar(baseEventData);

    expect(result.success).toBe(false);
    expect(mockDelete).toHaveBeenCalledWith("gcal-event-orphan");
    expect(mockMarkError).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: baseEventData.eventId,
        error: "DB connection lost",
      }),
    );
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
    mockIsConfigured.mockReset();
    mockIsConfigured.mockResolvedValue(true);
    mockDelete.mockClear();
    mockClear.mockClear();
    mockMarkError.mockClear();
  });

  test("deleteCalendarEvent(gcalEventId, {ignoreEnabledToggle:true}) 呼び出し + clearEventGoogleCalendarEventId 呼び出し", async () => {
    mockDelete.mockImplementation(() => Promise.resolve({ success: true }));

    const result = await deleteEventCalendarSync(
      "event-id-001",
      "gcal-event-to-delete",
    );

    expect(result).toEqual({ success: true });
    expect(mockDelete).toHaveBeenCalledTimes(1);
    expect(mockDelete).toHaveBeenCalledWith("gcal-event-to-delete", {
      ignoreEnabledToggle: true,
    });
    expect(mockClear).toHaveBeenCalledTimes(1);
    expect(mockClear).toHaveBeenCalledWith(
      expect.objectContaining({
        googleCalendarEventId: "gcal-event-to-delete",
      }),
    );
  });

  // GCAL-OUTBOUND-05: delete は isGoogleCalendarEnabled (トグル) ではなく
  // isGoogleCalendarConfigured を gate にする。トグル OFF でも削除は実行される。
  test("トグル OFF (isGoogleCalendarEnabled=false) でも configured なら削除する", async () => {
    mockIsEnabled.mockImplementation(() => Promise.resolve(false));
    mockIsConfigured.mockResolvedValue(true);
    mockDelete.mockImplementation(() => Promise.resolve({ success: true }));

    const result = await deleteEventCalendarSync(
      "event-id-001",
      "gcal-event-to-delete",
    );

    expect(result).toEqual({ success: true });
    expect(mockDelete).toHaveBeenCalledTimes(1);
  });

  test("未 configured (サービスアカウント/カレンダーID 未設定) → no-op { success: true }", async () => {
    mockIsConfigured.mockResolvedValue(false);

    const result = await deleteEventCalendarSync(
      "event-id-001",
      "gcal-event-to-delete",
    );

    expect(result).toEqual({ success: true });
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  });

  test("deleteCalendarEvent が soft failure の場合 markEventCalendarSyncError を呼ぶ", async () => {
    mockDelete.mockImplementation(() =>
      Promise.resolve({ success: false, error: "not found" }),
    );

    const result = await deleteEventCalendarSync(
      "event-id-001",
      "gcal-event-to-delete",
    );

    expect(result).toEqual({ success: false, error: "not found" });
    expect(mockMarkError).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event-id-001",
        error: "gcal_delete_failed:not found",
      }),
    );
    expect(mockClear).not.toHaveBeenCalled();
  });
});

// =============================================================================
// GCAL-AUDIT-04: event outbound retry (calendar-sync-retry cron)
// =============================================================================

describe("retryFailedEventCalendarSyncs", () => {
  beforeEach(() => {
    mockIsEnabled.mockReset();
    mockIsEnabled.mockResolvedValue(true);
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ success: true, eventId: "gcal-retry-1" });
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ success: true });
    mockDelete.mockReset();
    mockDelete.mockResolvedValue({ success: true });
    mockSave.mockReset();
    mockSave.mockResolvedValue(undefined);
    mockMarkError.mockReset();
    mockMarkSuccess.mockReset();
    mockMarkSuccess.mockResolvedValue(undefined);
    mockGetFailedEventIds.mockReset();
    mockGetForSync.mockReset();
    mockGetGcalIdsForDelete.mockReset();
    mockGetGcalIdsForDelete.mockResolvedValue([]);
    mockGetEventCalendarSyncError.mockReset();
    mockGetEventCalendarSyncError.mockResolvedValue(null);
  });

  test("googleCalendarEventId が null のスロットのみ create を再試行する", async () => {
    mockGetFailedEventIds.mockResolvedValue(["event-1"]);
    mockGetForSync.mockResolvedValue([
      { ...baseEventData, slotId: "slot-a", googleCalendarEventId: null },
      {
        ...baseEventData,
        slotId: "slot-b",
        googleCalendarEventId: "already-synced",
      },
    ]);

    const result = await retryFailedEventCalendarSyncs();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ total: 1, succeeded: 1, failed: 0 });
  });

  test("全 slot が同期済みになったら markEventCalendarSyncSuccess を呼ぶ", async () => {
    mockGetFailedEventIds.mockResolvedValue(["event-1"]);
    mockGetForSync
      .mockResolvedValueOnce([
        { ...baseEventData, slotId: "slot-a", googleCalendarEventId: null },
      ])
      .mockResolvedValueOnce([
        {
          ...baseEventData,
          slotId: "slot-a",
          googleCalendarEventId: "gcal-retry-1",
        },
      ]);

    await retryFailedEventCalendarSyncs();

    expect(mockMarkSuccess).toHaveBeenCalledWith("event-1");
  });

  test("対象 slot が無い Meet-only エラーは自動 retry も自動 clear もしない", async () => {
    mockGetFailedEventIds.mockResolvedValue(["event-2"]);
    mockGetEventCalendarSyncError.mockResolvedValue(
      "Meet URL write-back failed: DB unavailable",
    );
    mockGetForSync.mockResolvedValue([
      {
        ...baseEventData,
        slotId: "slot-c",
        googleCalendarEventId: "already-synced",
      },
    ]);

    const result = await retryFailedEventCalendarSyncs();

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockMarkSuccess).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 0, succeeded: 0, failed: 0 });
  });

  test("googleCalendarEventId 有り + 通常 update 失敗 → update を再試行する", async () => {
    mockGetFailedEventIds.mockResolvedValue(["event-update-1"]);
    mockGetEventCalendarSyncError.mockResolvedValue(
      "Update failed: network error",
    );
    mockGetForSync.mockResolvedValue([
      {
        ...baseEventData,
        slotId: "slot-u1",
        googleCalendarEventId: "gcal-existing-1",
      },
    ]);

    const result = await retryFailedEventCalendarSyncs();

    expect(mockUpdate).toHaveBeenCalledWith(
      "gcal-existing-1",
      expect.objectContaining({ summary: baseEventData.title }),
    );
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockMarkSuccess).toHaveBeenCalledWith("event-update-1");
    expect(result).toEqual({ total: 1, succeeded: 1, failed: 0 });
  });

  test("update 再試行が失敗した場合は failed に計上し markEventCalendarSyncSuccess を呼ばない", async () => {
    mockGetFailedEventIds.mockResolvedValue(["event-update-2"]);
    mockGetEventCalendarSyncError.mockResolvedValue("Update failed: quota");
    mockUpdate.mockResolvedValue({ success: false, error: "quota exceeded" });
    mockGetForSync.mockResolvedValue([
      {
        ...baseEventData,
        slotId: "slot-u2",
        googleCalendarEventId: "gcal-existing-2",
      },
    ]);

    const result = await retryFailedEventCalendarSyncs();

    expect(result).toEqual({ total: 1, succeeded: 0, failed: 1 });
    expect(mockMarkSuccess).not.toHaveBeenCalled();
  });

  test("create 失敗時は failed に計上し markEventCalendarSyncSuccess を呼ばない", async () => {
    mockGetFailedEventIds.mockResolvedValue(["event-3"]);
    mockCreate.mockResolvedValue({ success: false, error: "quota exceeded" });
    mockGetForSync.mockResolvedValue([
      { ...baseEventData, slotId: "slot-d", googleCalendarEventId: null },
    ]);

    const result = await retryFailedEventCalendarSyncs();

    expect(result).toEqual({ total: 1, succeeded: 0, failed: 1 });
    expect(mockMarkSuccess).not.toHaveBeenCalled();
  });

  test("delete 失敗 (GCAL_DELETE_FAILED_PREFIX) は delete を再試行する", async () => {
    mockGetFailedEventIds.mockResolvedValue(["event-delete-1"]);
    mockGetGcalIdsForDelete
      .mockResolvedValueOnce(["gcal-stale-1"])
      .mockResolvedValueOnce([]);
    mockGetEventCalendarSyncError.mockResolvedValue(
      "gcal_delete_failed:api error",
    );

    const result = await retryFailedEventCalendarSyncs();

    expect(mockDelete).toHaveBeenCalledWith("gcal-stale-1", {
      ignoreEnabledToggle: true,
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(mockMarkSuccess).toHaveBeenCalledWith("event-delete-1");
  });
});
