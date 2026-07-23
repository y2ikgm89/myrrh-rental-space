/**
 * syncFromCalendar の sync token 保存契約テスト (audit finding #1, #2)
 *
 * Google Incremental Sync 仕様:
 * - エラーがある場合は newSyncToken を保存してはならない（永久欠落を防ぐ）
 * - 全変更処理成功かつ newSyncToken が存在する場合のみトークンを保存する
 *
 * 検証観点:
 * 1. result.errors.length > 0 のとき saveCalendarSyncToken を呼ばない
 * 2. 変更処理中に例外が出て errors に追加されたとき saveCalendarSyncToken を呼ばない
 * 3. errors が空で newSyncToken が存在するとき saveCalendarSyncToken を 1 回呼ぶ
 * 4. errors が空でも newSyncToken が null/undefined のとき saveCalendarSyncToken を呼ばない
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// -----------------------------------------------------------------------
// モック関数定義（mock.module より前・TDZ 回避）
// -----------------------------------------------------------------------

const mockGetCalendarSyncRuntimeState = mock<
  () => Promise<{
    lastSyncedAt: Date | null;
    twoWaySyncEnabled: boolean;
    syncToken: string | null;
  }>
>(() =>
  Promise.resolve({
    lastSyncedAt: null,
    twoWaySyncEnabled: true,
    syncToken: "sync-token-prev",
  }),
);

const mockRecordCalendarSyncStarted = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);

const mockSaveCalendarSyncToken = mock<(token: string) => Promise<void>>(() =>
  Promise.resolve(),
);

// spread 呼び出しに対応するため (...args: unknown[]) で型付け
const mockApplyCalendarTimeChange = mock<
  (...args: unknown[]) => Promise<{ success: boolean }>
>(() => Promise.resolve({ success: true }));

const mockCancelReservationFromCalendar = mock<
  (...args: unknown[]) => Promise<void>
>(() => Promise.resolve());

const mockGetReservationByCalendarEventId = mock<
  (...args: unknown[]) => Promise<unknown>
>(() => Promise.resolve(null));

const mockFetchCalendarChanges = mock<
  () => Promise<{
    success: boolean;
    changes: Array<{
      eventId: string;
      deleted?: boolean;
      startTime?: Date;
      endTime?: Date;
    }>;
    newSyncToken?: string | null;
    error?: string;
  }>
>(() =>
  Promise.resolve({
    success: true,
    changes: [],
    newSyncToken: "sync-token-new",
  }),
);

const mockSendCalendarSyncRejectionEmail = mock<
  (...args: unknown[]) => Promise<void>
>(() => Promise.resolve());

const mockLogError = mock<(...args: unknown[]) => void>(() => undefined);

// -----------------------------------------------------------------------
// モジュールモック
// -----------------------------------------------------------------------

mock.module("server-only", () => ({}));

mock.module("@/shared/domain/reservations/calendar-sync", () => ({
  getCalendarSyncRuntimeState: () => mockGetCalendarSyncRuntimeState(),
  recordCalendarSyncStarted: () => mockRecordCalendarSyncStarted(),
  saveCalendarSyncToken: (token: string) => mockSaveCalendarSyncToken(token),
  applyCalendarTimeChange: (...args: unknown[]) =>
    mockApplyCalendarTimeChange(...args),
  cancelReservationFromCalendar: (...args: unknown[]) =>
    mockCancelReservationFromCalendar(...args),
  getReservationByCalendarEventId: (...args: unknown[]) =>
    mockGetReservationByCalendarEventId(...args),
}));

mock.module("@/shared/lib/google-calendar", () => ({
  fetchCalendarChanges: () => mockFetchCalendarChanges(),
}));

mock.module("@/shared/lib/email/system-emails", () => ({
  sendCalendarSyncRejectionEmail: (...args: unknown[]) =>
    mockSendCalendarSyncRejectionEmail(...args),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: {
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    DATABASE: "DATABASE",
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
  fireAndForget: () => undefined,
}));

mock.module("@/shared/lib/validations/enums/helpers", () => ({
  ACTIVE_RESERVATION_STATUSES: ["PENDING", "CONFIRMED"],
}));

const { syncFromCalendar } = await import("@/shared/lib/calendar-sync/inbound");

// -----------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------

describe("syncFromCalendar — sync token 保存契約", () => {
  beforeEach(() => {
    mockGetCalendarSyncRuntimeState.mockReset();
    mockRecordCalendarSyncStarted.mockReset();
    mockSaveCalendarSyncToken.mockReset();
    mockFetchCalendarChanges.mockReset();
    mockGetReservationByCalendarEventId.mockReset();
    mockCancelReservationFromCalendar.mockReset();
    mockLogError.mockReset();

    // デフォルト: 直前同期なし・2way 有効・前回 token あり
    mockGetCalendarSyncRuntimeState.mockResolvedValue({
      lastSyncedAt: null,
      twoWaySyncEnabled: true,
      syncToken: "sync-token-prev",
    });
    mockRecordCalendarSyncStarted.mockResolvedValue();
    mockSaveCalendarSyncToken.mockResolvedValue();
    mockGetReservationByCalendarEventId.mockResolvedValue(null);
    mockCancelReservationFromCalendar.mockResolvedValue();
  });

  test("エラーなし・newSyncToken あり → saveCalendarSyncToken を 1 回呼ぶ (#1/#2)", async () => {
    mockFetchCalendarChanges.mockResolvedValue({
      success: true,
      changes: [],
      newSyncToken: "sync-token-new",
    });

    await syncFromCalendar();

    expect(mockSaveCalendarSyncToken).toHaveBeenCalledTimes(1);
    expect(mockSaveCalendarSyncToken).toHaveBeenCalledWith("sync-token-new");
  });

  test("変更処理中に例外が出て errors に追加されたとき saveCalendarSyncToken を呼ばない (#1/#2)", async () => {
    mockFetchCalendarChanges.mockResolvedValue({
      success: true,
      changes: [{ eventId: "evt-throws", deleted: true }],
      newSyncToken: "sync-token-new",
    });
    // reservation が見つかった状態で cancelReservation が例外を投げる
    mockGetReservationByCalendarEventId.mockResolvedValue({
      id: "res-1",
      status: "CONFIRMED",
      startTime: new Date("2027-01-01T09:00:00Z"),
      endTime: new Date("2027-01-01T11:00:00Z"),
      notes: null,
      spaceId: "space-1",
      space: { name: "テストスペース" },
      customer: {
        lastName: "山田",
        firstName: "太郎",
        email: "test@example.com",
      },
      guestEmail: null,
    });
    mockCancelReservationFromCalendar.mockImplementation(() => {
      throw new Error("DB connection failed");
    });

    const result = await syncFromCalendar();

    // エラーが errors に追加される
    expect(result.errors.length).toBeGreaterThan(0);
    // エラーがある場合はトークンを保存しない
    expect(mockSaveCalendarSyncToken).not.toHaveBeenCalled();
  });

  test("fetchCalendarChanges 自体が success:false の場合は saveCalendarSyncToken を呼ばない", async () => {
    mockFetchCalendarChanges.mockResolvedValue({
      success: false,
      changes: [],
      error: "Failed to fetch",
    });

    await syncFromCalendar();

    expect(mockSaveCalendarSyncToken).not.toHaveBeenCalled();
  });

  test("errors が空でも newSyncToken が null の場合は saveCalendarSyncToken を呼ばない", async () => {
    mockFetchCalendarChanges.mockResolvedValue({
      success: true,
      changes: [],
      newSyncToken: null,
    });

    await syncFromCalendar();

    expect(mockSaveCalendarSyncToken).not.toHaveBeenCalled();
  });

  test("errors が空でも newSyncToken が undefined の場合は saveCalendarSyncToken を呼ばない", async () => {
    mockFetchCalendarChanges.mockResolvedValue({
      success: true,
      changes: [],
      // newSyncToken は undefined (省略)
    });

    await syncFromCalendar();

    expect(mockSaveCalendarSyncToken).not.toHaveBeenCalled();
  });

  test("2way sync が無効の場合は fetchCalendarChanges も saveCalendarSyncToken も呼ばない", async () => {
    mockGetCalendarSyncRuntimeState.mockResolvedValue({
      lastSyncedAt: null,
      twoWaySyncEnabled: false,
      syncToken: "sync-token-prev",
    });

    await syncFromCalendar();

    expect(mockFetchCalendarChanges).not.toHaveBeenCalled();
    expect(mockSaveCalendarSyncToken).not.toHaveBeenCalled();
  });
});
