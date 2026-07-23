import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { calendar_v3 } from "googleapis";

// =============================================================================
// GCAL-RETRY-04: retryFailedSyncs は standalone / series の 2 経路を持つ。
// - standalone: seriesId=null の失敗予約に対し createCalendarEvent (RRULE 無し)
// - series: seriesId!=null の失敗予約に対し既存 master への
//   fetchEventInstances + writeBack のみを再試行 (createCalendarEvent 呼ばない)
// この分離が壊れると series-child が二重に GCal 招待される regression が復活する。
// =============================================================================

// --- google-calendar mocks ---
const mockIsEnabled = mock<() => Promise<boolean>>(() => Promise.resolve(true));
const mockCreate = mock<
  (
    params: Record<string, unknown>,
    options?: { withMeet?: boolean },
  ) => Promise<{
    success: boolean;
    eventId?: string;
    error?: string;
    event?: calendar_v3.Schema$Event;
  }>
>(() => Promise.resolve({ success: true, eventId: "gcal-event-standalone" }));
const mockFetchInstances = mock<
  (masterId: string) => Promise<{
    success: boolean;
    instances?: { id: string; startTime: Date }[];
    error?: string;
  }>
>(() => Promise.resolve({ success: true, instances: [] }));
const mockUpdate = mock<
  (...args: unknown[]) => Promise<{ success: boolean; error?: string }>
>(() => Promise.resolve({ success: true }));
const mockDelete = mock<
  (...args: unknown[]) => Promise<{ success: boolean; error?: string }>
>(() => Promise.resolve({ success: true }));

mock.module("@/shared/lib/google-calendar", () => ({
  isGoogleCalendarEnabled: mockIsEnabled,
  createCalendarEvent: mockCreate,
  updateCalendarEvent: mockUpdate,
  deleteCalendarEvent: mockDelete,
  fetchEventInstances: mockFetchInstances,
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
  patchCalendarEvent: mock(() => Promise.resolve({ success: true })),
}));

// --- domain mocks ---
type FailedReservation = {
  id: string;
  status: string;
  startTime: Date;
  endTime: Date;
  notes: string | null;
  totalPrice: number | null;
  guestEmail: string | null;
  googleCalendarEventId: string | null;
  calendarSyncError: string | null;
  space: { name: string; lineAddress: string };
  customer: { firstName: string; lastName: string; email: string };
};

const mockGetFailedReservations = mock<() => Promise<FailedReservation[]>>(() =>
  Promise.resolve([]),
);
const mockGetFailedSeriesIds = mock<() => Promise<string[]>>(() =>
  Promise.resolve([]),
);
const mockGetSeriesMaster = mock<(seriesId: string) => Promise<string | null>>(
  () => Promise.resolve(null),
);
const mockGetSeriesInstances = mock<
  (seriesId: string) => Promise<{ id: string; startTime: Date }[]>
>(() => Promise.resolve([]));
const mockMarkSeriesInstanceSuccess = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);
const mockMarkSuccess = mock<() => Promise<void>>(() => Promise.resolve());
const mockMarkError = mock<() => Promise<void>>(() => Promise.resolve());

const mockClearReservationCalendarEvent = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);
const mockMarkUpdated = mock<() => Promise<void>>(() => Promise.resolve());

mock.module("@/shared/domain/reservations/calendar-sync", () => ({
  GCAL_DELETE_FAILED_PREFIX: "gcal_delete_failed:",
  clearReservationCalendarEvent: mockClearReservationCalendarEvent,
  getCalendarSyncRuntimeState: mock(() =>
    Promise.resolve({
      twoWaySyncEnabled: false,
      syncToken: null,
      lastSyncedAt: null,
      syncMethod: "polling",
      webhookChannelId: null,
      webhookExpiration: null,
    }),
  ),
  getFailedCalendarSyncReservations: mockGetFailedReservations,
  getFailedCalendarSyncSeriesIds: mockGetFailedSeriesIds,
  getSeriesForCalendarSync: mock(() => Promise.resolve(null)),
  getSeriesGcalMasterEventId: mockGetSeriesMaster,
  getSeriesInstanceStartTimes: mockGetSeriesInstances,
  markReservationCalendarSyncError: mockMarkError,
  markReservationCalendarSyncSuccess: mockMarkSuccess,
  markReservationCalendarSyncUpdated: mockMarkUpdated,
  markSeriesInstanceCalendarSyncSuccess: mockMarkSeriesInstanceSuccess,
  markSeriesMasterEventCreated: mock(() => Promise.resolve()),
}));

// --- errors ---
mock.module("@/shared/lib/errors/server", () => ({
  logError: mock(() => undefined),
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
  ErrorCategory: {
    DATABASE: "DATABASE",
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    AUTHORIZATION: "AUTHORIZATION",
    CACHE: "CACHE",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mock(() => undefined),
}));

const { retryFailedSyncs } =
  await import("@/shared/lib/calendar-sync/outbound");

function baseReservation(
  overrides: Partial<FailedReservation> = {},
): FailedReservation {
  return {
    id: "res-001",
    status: "CONFIRMED",
    startTime: new Date("2026-05-01T10:00:00Z"),
    endTime: new Date("2026-05-01T11:00:00Z"),
    notes: null,
    totalPrice: 1000,
    guestEmail: null,
    googleCalendarEventId: null,
    calendarSyncError: "create failed: quota exceeded",
    space: { name: "Space A", lineAddress: "東京都渋谷区" },
    customer: {
      firstName: "太郎",
      lastName: "山田",
      email: "taro@example.com",
    },
    ...overrides,
  };
}

describe("retryFailedSyncs — GCAL-RETRY-04 series/standalone separation", () => {
  beforeEach(() => {
    mockIsEnabled.mockReset();
    mockIsEnabled.mockResolvedValue(true);
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      success: true,
      eventId: "gcal-event-standalone",
    });
    mockFetchInstances.mockReset();
    mockFetchInstances.mockResolvedValue({ success: true, instances: [] });
    mockGetFailedReservations.mockReset();
    mockGetFailedReservations.mockResolvedValue([]);
    mockGetFailedSeriesIds.mockReset();
    mockGetFailedSeriesIds.mockResolvedValue([]);
    mockGetSeriesMaster.mockReset();
    mockGetSeriesMaster.mockResolvedValue(null);
    mockGetSeriesInstances.mockReset();
    mockGetSeriesInstances.mockResolvedValue([]);
    mockMarkSeriesInstanceSuccess.mockReset();
    mockMarkSeriesInstanceSuccess.mockResolvedValue(undefined);
    mockMarkSuccess.mockReset();
    mockMarkSuccess.mockResolvedValue(undefined);
    mockMarkError.mockReset();
    mockMarkError.mockResolvedValue(undefined);
    mockClearReservationCalendarEvent.mockReset();
    mockClearReservationCalendarEvent.mockResolvedValue(undefined);
    mockMarkUpdated.mockReset();
    mockMarkUpdated.mockResolvedValue(undefined);
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ success: true });
    mockDelete.mockReset();
    mockDelete.mockResolvedValue({ success: true });
  });

  test("standalone 予約は createCalendarEvent (RRULE 無し) で再送", async () => {
    mockGetFailedReservations.mockResolvedValue([baseReservation()]);

    const result = await retryFailedSyncs();

    expect(result).toEqual({ total: 1, succeeded: 1, failed: 0 });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    // RRULE (recurrence) は付与されない
    const call = mockCreate.mock.calls[0]?.[0];
    expect(call).toBeDefined();
    expect(call?.["recurrence"]).toBeUndefined();
  });

  test("series-child は createCalendarEvent を呼ばず fetchEventInstances + writeBack のみ", async () => {
    // 前提: standalone pool は空 (getFailedCalendarSyncReservations が seriesId:null で除外)
    mockGetFailedReservations.mockResolvedValue([]);
    mockGetFailedSeriesIds.mockResolvedValue(["series-001"]);
    mockGetSeriesMaster.mockResolvedValue("gcal-master-001");
    const startTime = new Date("2026-05-01T01:00:00Z");
    mockGetSeriesInstances.mockResolvedValue([{ id: "res-a", startTime }]);
    mockFetchInstances.mockResolvedValue({
      success: true,
      instances: [{ id: "gcal-master-001_20260501T010000Z", startTime }],
    });

    const result = await retryFailedSyncs();

    // series 再試行では createCalendarEvent (RRULE 二重招待経路) を絶対に呼ばない
    expect(mockCreate).not.toHaveBeenCalled();
    // 既存 master に対して fetchEventInstances のみ
    expect(mockFetchInstances).toHaveBeenCalledWith("gcal-master-001");
    // write-back で child eventId が Reservation に書き戻される
    expect(mockMarkSeriesInstanceSuccess).toHaveBeenCalledWith({
      reservationId: "res-a",
      googleCalendarEventId: "gcal-master-001_20260501T010000Z",
    });
    expect(result).toEqual({ total: 1, succeeded: 1, failed: 0 });
  });

  test("series の master 未永続 → 想定外として failed 計上 + logError", async () => {
    mockGetFailedSeriesIds.mockResolvedValue(["series-orphan"]);
    mockGetSeriesMaster.mockResolvedValue(null);
    mockGetSeriesInstances.mockResolvedValue([
      { id: "res-x", startTime: new Date("2026-05-01T01:00:00Z") },
      { id: "res-y", startTime: new Date("2026-05-08T01:00:00Z") },
    ]);

    const result = await retryFailedSyncs();

    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockFetchInstances).not.toHaveBeenCalled();
    expect(result).toEqual({ total: 2, succeeded: 0, failed: 2 });
  });

  test("standalone と series の合計を返す", async () => {
    mockGetFailedReservations.mockResolvedValue([
      baseReservation({ id: "res-standalone-a" }),
      baseReservation({ id: "res-standalone-b" }),
    ]);
    mockGetFailedSeriesIds.mockResolvedValue(["series-001"]);
    mockGetSeriesMaster.mockResolvedValue("gcal-master-001");
    const startTime = new Date("2026-05-01T01:00:00Z");
    mockGetSeriesInstances.mockResolvedValue([{ id: "res-a", startTime }]);
    mockFetchInstances.mockResolvedValue({
      success: true,
      instances: [{ id: "gcal-master-001_20260501T010000Z", startTime }],
    });

    const result = await retryFailedSyncs();

    expect(result).toEqual({ total: 3, succeeded: 3, failed: 0 });
    expect(mockCreate).toHaveBeenCalledTimes(2); // standalone のみ
  });
});

describe("retryFailedSyncs — GCAL-AUDIT-05 create/update/delete 振り分け", () => {
  beforeEach(() => {
    mockIsEnabled.mockReset();
    mockIsEnabled.mockResolvedValue(true);
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({
      success: true,
      eventId: "gcal-event-standalone",
    });
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ success: true });
    mockDelete.mockReset();
    mockDelete.mockResolvedValue({ success: true });
    mockGetFailedReservations.mockReset();
    mockGetFailedSeriesIds.mockReset();
    mockGetFailedSeriesIds.mockResolvedValue([]);
    mockMarkSuccess.mockReset();
    mockMarkSuccess.mockResolvedValue(undefined);
    mockMarkUpdated.mockReset();
    mockMarkUpdated.mockResolvedValue(undefined);
    mockMarkError.mockReset();
    mockMarkError.mockResolvedValue(undefined);
    mockClearReservationCalendarEvent.mockReset();
    mockClearReservationCalendarEvent.mockResolvedValue(undefined);
  });

  test("googleCalendarEventId が null → create (syncReservationToCalendar) を再試行", async () => {
    mockGetFailedReservations.mockResolvedValue([
      baseReservation({ googleCalendarEventId: null }),
    ]);

    await retryFailedSyncs();

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
  });

  test("googleCalendarEventId 有り + gcal_delete_failed: prefix → delete を再試行", async () => {
    mockGetFailedReservations.mockResolvedValue([
      baseReservation({
        status: "CANCELLED",
        googleCalendarEventId: "gcal-existing-001",
        calendarSyncError: "gcal_delete_failed:Rate limit exceeded",
      }),
    ]);

    const result = await retryFailedSyncs();

    expect(mockDelete).toHaveBeenCalledWith("gcal-existing-001");
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockClearReservationCalendarEvent).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ total: 1, succeeded: 1, failed: 0 });
  });

  test("googleCalendarEventId 有り + それ以外のエラー → update を再試行", async () => {
    mockGetFailedReservations.mockResolvedValue([
      baseReservation({
        googleCalendarEventId: "gcal-existing-002",
        calendarSyncError: "Update failed: network error",
      }),
    ]);

    const result = await retryFailedSyncs();

    expect(mockUpdate).toHaveBeenCalledWith(
      "gcal-existing-002",
      expect.any(Object),
    );
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockDelete).not.toHaveBeenCalled();
    expect(mockMarkUpdated).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ total: 1, succeeded: 1, failed: 0 });
  });

  test("delete 再試行が失敗した場合は failed に計上される", async () => {
    mockDelete.mockResolvedValue({ success: false, error: "still failing" });
    mockGetFailedReservations.mockResolvedValue([
      baseReservation({
        status: "CANCELLED",
        googleCalendarEventId: "gcal-existing-003",
        calendarSyncError: "gcal_delete_failed:still failing",
      }),
    ]);

    const result = await retryFailedSyncs();

    expect(result).toEqual({ total: 1, succeeded: 0, failed: 1 });
  });
});
