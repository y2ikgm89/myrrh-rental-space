/**
 * retryFailedSeriesMasterOperations の単体テスト (GCAL-OUTBOUND-07)。
 *
 * `patchGcalMasterUntil` / `deleteGcalMaster` の失敗が typed prefix 付き
 * `calendarSyncError` として series instance に永続化された後、それを
 * cron から拾って再試行できることを検証する。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockIsConfigured = mock<() => Promise<boolean>>(() =>
  Promise.resolve(true),
);
const mockPatchCalendarEvent = mock<
  (...args: unknown[]) => Promise<{ success: boolean; error?: string }>
>(() => Promise.resolve({ success: true }));
const mockDeleteCalendarEvent = mock<
  (...args: unknown[]) => Promise<{ success: boolean; error?: string }>
>(() => Promise.resolve({ success: true }));

mock.module("@/shared/domain/settings/google-calendar", () => ({
  isGoogleCalendarConfigured: mockIsConfigured,
}));

mock.module("@/shared/domain/settings/google-calendar-api", () => ({
  patchCalendarEvent: mockPatchCalendarEvent,
  deleteCalendarEvent: mockDeleteCalendarEvent,
  resolveGoogleCalendarWriteContext: mock(() =>
    Promise.resolve({ ok: false, error: "mocked" }),
  ),
}));

type SeriesForCalendarSync = {
  id: string;
  rrule: string;
  dtstart: Date;
  duration: number;
  spaceName: string;
  spaceAddressDetail: string | null;
  locationAddress: string;
  customerLastName: string;
  customerFirstName: string;
  customerEmail: string;
};

const mockGetSeriesForCalendarSync = mock<
  (seriesId: string) => Promise<SeriesForCalendarSync | null>
>(() => Promise.resolve(null));
const mockGetSeriesGcalMasterEventId = mock<
  (seriesId: string) => Promise<string | null>
>(() => Promise.resolve(null));
const mockGetSeriesIdsWithMasterOperationFailure = mock<
  () => Promise<string[]>
>(() => Promise.resolve([]));
const mockGetSeriesMasterOperationFailureInstances = mock<
  (seriesId: string) => Promise<{ id: string; calendarSyncError: string }[]>
>(() => Promise.resolve([]));
const mockMarkReservationCalendarSyncUpdated = mock<
  (reservationId: string) => Promise<void>
>(() => Promise.resolve());

mock.module("@/shared/domain/reservations/calendar-sync", () => ({
  markReservationCalendarSyncUpdated: mockMarkReservationCalendarSyncUpdated,
}));

mock.module("@/shared/domain/reservations/calendar-sync-series", () => ({
  GCAL_SERIES_MASTER_PATCH_FAILED_PREFIX: "gcal_series_master_patch_failed:",
  GCAL_SERIES_MASTER_DELETE_FAILED_PREFIX: "gcal_series_master_delete_failed:",
  getSeriesForCalendarSync: mockGetSeriesForCalendarSync,
  getSeriesGcalMasterEventId: mockGetSeriesGcalMasterEventId,
  getSeriesIdsWithMasterOperationFailure:
    mockGetSeriesIdsWithMasterOperationFailure,
  getSeriesMasterOperationFailureInstances:
    mockGetSeriesMasterOperationFailureInstances,
}));

mock.module("@/shared/domain/reservations/series-rrule", () => ({
  rebuildRruleWithUntil: mock(
    (_rrule: string, _dtstart: Date, until: Date) =>
      `FREQ=WEEKLY;UNTIL=${until.toISOString()}`,
  ),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: { DATABASE: "DATABASE", EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { LOW: "LOW", MEDIUM: "MEDIUM" },
}));

const { retryFailedSeriesMasterOperations } =
  await import("@/shared/domain/reservations/series-calendar-outbound");

describe("retryFailedSeriesMasterOperations (GCAL-OUTBOUND-07)", () => {
  beforeEach(() => {
    mockIsConfigured.mockReset();
    mockIsConfigured.mockResolvedValue(true);
    mockPatchCalendarEvent.mockReset();
    mockPatchCalendarEvent.mockResolvedValue({ success: true });
    mockDeleteCalendarEvent.mockReset();
    mockDeleteCalendarEvent.mockResolvedValue({ success: true });
    mockGetSeriesForCalendarSync.mockReset();
    mockGetSeriesForCalendarSync.mockResolvedValue({
      id: "series-1",
      rrule: "FREQ=WEEKLY;COUNT=5",
      dtstart: new Date("2026-05-01T01:00:00Z"),
      duration: 60,
      spaceName: "Space A",
      spaceAddressDetail: null,
      locationAddress: "東京都渋谷区",
      customerLastName: "山田",
      customerFirstName: "太郎",
      customerEmail: "taro@example.com",
    });
    mockGetSeriesGcalMasterEventId.mockReset();
    mockGetSeriesGcalMasterEventId.mockResolvedValue("gcal-master-001");
    mockGetSeriesIdsWithMasterOperationFailure.mockReset();
    mockGetSeriesIdsWithMasterOperationFailure.mockResolvedValue([]);
    mockGetSeriesMasterOperationFailureInstances.mockReset();
    mockGetSeriesMasterOperationFailureInstances.mockResolvedValue([]);
    mockMarkReservationCalendarSyncUpdated.mockReset();
    mockMarkReservationCalendarSyncUpdated.mockResolvedValue(undefined);
  });

  test("delete failed prefix → deleteGcalMaster を再試行し、成功時に calendarSyncError をクリアする", async () => {
    mockGetSeriesIdsWithMasterOperationFailure.mockResolvedValue(["series-1"]);
    mockGetSeriesMasterOperationFailureInstances.mockResolvedValue([
      {
        id: "res-a",
        calendarSyncError: "gcal_series_master_delete_failed:rate limit",
      },
      {
        id: "res-b",
        calendarSyncError: "gcal_series_master_delete_failed:rate limit",
      },
    ]);

    const result = await retryFailedSeriesMasterOperations();

    expect(mockDeleteCalendarEvent).toHaveBeenCalledWith("gcal-master-001", {
      ignoreEnabledToggle: true,
    });
    expect(mockMarkReservationCalendarSyncUpdated).toHaveBeenCalledTimes(2);
    expect(mockMarkReservationCalendarSyncUpdated).toHaveBeenCalledWith(
      "res-a",
    );
    expect(mockMarkReservationCalendarSyncUpdated).toHaveBeenCalledWith(
      "res-b",
    );
    expect(result).toEqual({ total: 2, succeeded: 2, failed: 0 });
  });

  test("patch failed prefix → until を復号して patchGcalMasterUntil を再試行する", async () => {
    const until = new Date("2026-06-01T00:00:00.000Z");
    mockGetSeriesIdsWithMasterOperationFailure.mockResolvedValue(["series-1"]);
    mockGetSeriesMasterOperationFailureInstances.mockResolvedValue([
      {
        id: "res-a",
        calendarSyncError: `gcal_series_master_patch_failed:${until.toISOString()}|network error`,
      },
    ]);

    const result = await retryFailedSeriesMasterOperations();

    expect(mockPatchCalendarEvent).toHaveBeenCalledWith(
      "gcal-master-001",
      expect.objectContaining({ recurrence: expect.any(Array) }),
      { ignoreEnabledToggle: true },
    );
    expect(mockMarkReservationCalendarSyncUpdated).toHaveBeenCalledWith(
      "res-a",
    );
    expect(result).toEqual({ total: 1, succeeded: 1, failed: 0 });
  });

  test("再試行が再度失敗すれば failed 計上し calendarSyncError はクリアしない", async () => {
    mockDeleteCalendarEvent.mockResolvedValue({
      success: false,
      error: "still failing",
    });
    mockGetSeriesIdsWithMasterOperationFailure.mockResolvedValue(["series-1"]);
    mockGetSeriesMasterOperationFailureInstances.mockResolvedValue([
      {
        id: "res-a",
        calendarSyncError: "gcal_series_master_delete_failed:still failing",
      },
    ]);

    const result = await retryFailedSeriesMasterOperations();

    expect(mockMarkReservationCalendarSyncUpdated).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 1, succeeded: 0, failed: 1 });
  });

  test("master eventId が既に無い series は再試行できず failed 計上", async () => {
    mockGetSeriesGcalMasterEventId.mockResolvedValue(null);
    mockGetSeriesIdsWithMasterOperationFailure.mockResolvedValue([
      "series-orphan",
    ]);
    mockGetSeriesMasterOperationFailureInstances.mockResolvedValue([
      {
        id: "res-a",
        calendarSyncError: "gcal_series_master_delete_failed:x",
      },
    ]);

    const result = await retryFailedSeriesMasterOperations();

    expect(mockDeleteCalendarEvent).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 1, succeeded: 0, failed: 1 });
  });

  test("失敗 series が無ければ no-op", async () => {
    const result = await retryFailedSeriesMasterOperations();
    expect(result).toEqual({ total: 0, succeeded: 0, failed: 0 });
  });
});
