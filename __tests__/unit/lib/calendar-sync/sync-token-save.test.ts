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

const mockRecordCalendarSyncCompleted = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);

const mockSaveCalendarSyncToken = mock<(token: string) => Promise<void>>(() =>
  Promise.resolve(),
);

// spread 呼び出しに対応するため (...args: unknown[]) で型付け
const mockApplyCalendarTimeChange = mock<
  (...args: unknown[]) => Promise<
    | { success: true }
    | {
        success: false;
        reason: string;
        conflictingReservation?: {
          id: string;
          startTime: Date;
          endTime: Date;
        };
      }
  >
>(() => Promise.resolve({ success: true }));

const mockCancelReservationFromCalendar = mock<
  (...args: unknown[]) => Promise<{ cancelled: boolean }>
>(() => Promise.resolve({ cancelled: true }));

const mockApplyCancellationSideEffects = mock<
  (...args: unknown[]) => Promise<void>
>(() => Promise.resolve());

const mockApplyReservationEditSideEffects = mock<
  (
    ...args: unknown[]
  ) => Promise<{ passcodes: unknown[]; issuanceFailed: boolean }>
>(() => Promise.resolve({ passcodes: [], issuanceFailed: false }));

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
  GCAL_DELETE_CANCELLATION_REASON:
    "Google Calendar 上でイベントが削除されたため自動キャンセル",
  getCalendarSyncRuntimeState: () => mockGetCalendarSyncRuntimeState(),
  recordCalendarSyncCompleted: () => mockRecordCalendarSyncCompleted(),
  saveCalendarSyncToken: (token: string) => mockSaveCalendarSyncToken(token),
  applyCalendarTimeChange: (...args: unknown[]) =>
    mockApplyCalendarTimeChange(...args),
  cancelReservationFromCalendar: (...args: unknown[]) =>
    mockCancelReservationFromCalendar(...args),
  getReservationByCalendarEventId: (...args: unknown[]) =>
    mockGetReservationByCalendarEventId(...args),
}));

mock.module("@/shared/domain/reservations/cancellation-side-effects", () => ({
  applyCancellationSideEffects: (...args: unknown[]) =>
    mockApplyCancellationSideEffects(...args),
}));

mock.module("@/shared/domain/reservations/edit-side-effects", () => ({
  applyReservationEditSideEffects: (...args: unknown[]) =>
    mockApplyReservationEditSideEffects(...args),
}));

mock.module("@/shared/lib/google-calendar", () => ({
  fetchCalendarChanges: () => mockFetchCalendarChanges(),
}));

mock.module("@/shared/lib/email/system-emails", () => ({
  sendCalendarSyncRejectionEmail: (...args: unknown[]) =>
    mockSendCalendarSyncRejectionEmail(...args),
}));

mock.module("@/shared/lib/validations/enums/prisma-types", () => ({
  PaymentStatus: {
    UNPAID: "UNPAID",
    PENDING: "PENDING",
    PAID: "PAID",
    PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
    REFUNDED: "REFUNDED",
    FAILED: "FAILED",
  },
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

const { syncFromCalendar } =
  await import("@/shared/domain/reservations/reservation-calendar-inbound");

// -----------------------------------------------------------------------
// Suite
// -----------------------------------------------------------------------

describe("syncFromCalendar — sync token 保存契約", () => {
  beforeEach(() => {
    mockGetCalendarSyncRuntimeState.mockReset();
    mockRecordCalendarSyncCompleted.mockReset();
    mockSaveCalendarSyncToken.mockReset();
    mockFetchCalendarChanges.mockReset();
    mockGetReservationByCalendarEventId.mockReset();
    mockCancelReservationFromCalendar.mockReset();
    mockApplyCancellationSideEffects.mockReset();
    mockApplyReservationEditSideEffects.mockReset();
    mockLogError.mockReset();

    // デフォルト: 直前同期なし・2way 有効・前回 token あり
    mockGetCalendarSyncRuntimeState.mockResolvedValue({
      lastSyncedAt: null,
      twoWaySyncEnabled: true,
      syncToken: "sync-token-prev",
    });
    mockRecordCalendarSyncCompleted.mockResolvedValue();
    mockSaveCalendarSyncToken.mockResolvedValue();
    mockGetReservationByCalendarEventId.mockResolvedValue(null);
    mockCancelReservationFromCalendar.mockResolvedValue({ cancelled: true });
    mockApplyCancellationSideEffects.mockResolvedValue();
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

  test("全処理成功時のみ recordCalendarSyncCompleted を呼ぶ (#9)", async () => {
    mockFetchCalendarChanges.mockResolvedValue({
      success: true,
      changes: [],
      newSyncToken: "sync-token-new",
    });

    await syncFromCalendar();

    expect(mockRecordCalendarSyncCompleted).toHaveBeenCalledTimes(1);
  });

  test("fetch 失敗時は recordCalendarSyncCompleted を呼ばない（即時リトライを妨げない） (#9)", async () => {
    mockFetchCalendarChanges.mockResolvedValue({
      success: false,
      changes: [],
      error: "Failed to fetch",
    });

    await syncFromCalendar();

    expect(mockRecordCalendarSyncCompleted).not.toHaveBeenCalled();
  });
});

describe("syncFromCalendar — GCal 削除検知 → applyCancellationSideEffects (#3)", () => {
  beforeEach(() => {
    mockGetCalendarSyncRuntimeState.mockReset();
    mockRecordCalendarSyncCompleted.mockReset();
    mockSaveCalendarSyncToken.mockReset();
    mockFetchCalendarChanges.mockReset();
    mockGetReservationByCalendarEventId.mockReset();
    mockCancelReservationFromCalendar.mockReset();
    mockApplyCancellationSideEffects.mockReset();
    mockLogError.mockReset();

    mockGetCalendarSyncRuntimeState.mockResolvedValue({
      lastSyncedAt: null,
      twoWaySyncEnabled: true,
      syncToken: "sync-token-prev",
    });
    mockRecordCalendarSyncCompleted.mockResolvedValue();
    mockSaveCalendarSyncToken.mockResolvedValue();
    mockApplyCancellationSideEffects.mockResolvedValue();
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
      paymentStatus: "UNPAID",
    });
    mockFetchCalendarChanges.mockResolvedValue({
      success: true,
      changes: [{ eventId: "evt-deleted", deleted: true }],
      newSyncToken: "sync-token-new",
    });
  });

  test("atomic claim 成功時、gcalDelete を suppress して applyCancellationSideEffects を await 呼び出しする", async () => {
    mockCancelReservationFromCalendar.mockResolvedValue({ cancelled: true });

    const result = await syncFromCalendar();

    expect(mockCancelReservationFromCalendar).toHaveBeenCalledWith({
      reservationId: "res-1",
      existingNotes: null,
    });
    expect(mockApplyCancellationSideEffects).toHaveBeenCalledTimes(1);
    expect(mockApplyCancellationSideEffects).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: "res-1",
        channel: "system",
        actorUserId: null,
        suppress: { gcalDelete: true },
        awaitCompletion: true,
      }),
    );
    expect(result.deleted).toBe(1);
  });

  test("atomic claim が失敗 (既に終端状態) のとき applyCancellationSideEffects を呼ばない", async () => {
    mockCancelReservationFromCalendar.mockResolvedValue({ cancelled: false });

    const result = await syncFromCalendar();

    expect(mockApplyCancellationSideEffects).not.toHaveBeenCalled();
    expect(result.deleted).toBe(0);
  });
});

describe("syncFromCalendar — 決済確定/保留中の予約は時間変更を拒否する (#11)", () => {
  beforeEach(() => {
    mockGetCalendarSyncRuntimeState.mockReset();
    mockRecordCalendarSyncCompleted.mockReset();
    mockSaveCalendarSyncToken.mockReset();
    mockFetchCalendarChanges.mockReset();
    mockGetReservationByCalendarEventId.mockReset();
    mockApplyCalendarTimeChange.mockReset();
    mockApplyReservationEditSideEffects.mockReset();
    mockSendCalendarSyncRejectionEmail.mockReset();
    mockLogError.mockReset();

    mockGetCalendarSyncRuntimeState.mockResolvedValue({
      lastSyncedAt: null,
      twoWaySyncEnabled: true,
      syncToken: "sync-token-prev",
    });
    mockRecordCalendarSyncCompleted.mockResolvedValue();
    mockSaveCalendarSyncToken.mockResolvedValue();
    mockApplyCalendarTimeChange.mockResolvedValue({ success: true });
    mockSendCalendarSyncRejectionEmail.mockResolvedValue();
    mockFetchCalendarChanges.mockResolvedValue({
      success: true,
      changes: [
        {
          eventId: "evt-time-change",
          startTime: new Date("2027-02-01T10:00:00Z"),
          endTime: new Date("2027-02-01T12:00:00Z"),
        },
      ],
      newSyncToken: "sync-token-new",
    });
  });

  function reservationWith(paymentStatus: string) {
    return {
      id: "res-2",
      status: "CONFIRMED",
      startTime: new Date("2027-02-01T09:00:00Z"),
      endTime: new Date("2027-02-01T11:00:00Z"),
      notes: null,
      spaceId: "space-1",
      space: { name: "テストスペース" },
      customer: {
        lastName: "山田",
        firstName: "太郎",
        email: "test@example.com",
      },
      guestEmail: null,
      paymentStatus,
    };
  }

  test.each(["PAID", "PARTIALLY_REFUNDED", "PENDING", "REFUNDED", "FAILED"])(
    "paymentStatus=%s は applyCalendarTimeChange を呼ばず拒否メールを送る",
    async (paymentStatus) => {
      mockGetReservationByCalendarEventId.mockResolvedValue(
        reservationWith(paymentStatus),
      );

      const result = await syncFromCalendar();

      expect(mockApplyCalendarTimeChange).not.toHaveBeenCalled();
      expect(mockSendCalendarSyncRejectionEmail).toHaveBeenCalledTimes(1);
      expect(mockSendCalendarSyncRejectionEmail).toHaveBeenCalledWith(
        expect.objectContaining({ reservationId: "res-2" }),
      );
      expect(result.updated).toBe(0);
    },
  );

  test("paymentStatus=UNPAID は applyCalendarTimeChange 経由で即時反映される", async () => {
    mockGetReservationByCalendarEventId.mockResolvedValue(
      reservationWith("UNPAID"),
    );

    const result = await syncFromCalendar();

    expect(mockApplyCalendarTimeChange).toHaveBeenCalledTimes(1);
    expect(mockSendCalendarSyncRejectionEmail).not.toHaveBeenCalled();
    expect(result.updated).toBe(1);
  });

  test("applyCalendarTimeChange 成功後に applyReservationEditSideEffects を呼ぶ", async () => {
    const reservation = reservationWith("UNPAID");
    mockGetReservationByCalendarEventId.mockResolvedValue(reservation);

    await syncFromCalendar();

    expect(mockApplyReservationEditSideEffects).toHaveBeenCalledTimes(1);
    expect(mockApplyReservationEditSideEffects).toHaveBeenCalledWith({
      reservationId: reservation.id,
      oldSpaceId: reservation.spaceId,
      oldStartTime: reservation.startTime,
      oldEndTime: reservation.endTime,
      newSpaceId: reservation.spaceId,
      newStartTime: new Date("2027-02-01T10:00:00Z"),
      newEndTime: new Date("2027-02-01T12:00:00Z"),
    });
  });

  test("applyCalendarTimeChange 失敗時は applyReservationEditSideEffects を呼ばない", async () => {
    mockGetReservationByCalendarEventId.mockResolvedValue(
      reservationWith("UNPAID"),
    );
    mockApplyCalendarTimeChange.mockResolvedValue({
      success: false,
      reason: "overlap",
      conflictingReservation: {
        id: "conflict-1",
        startTime: new Date("2027-02-01T10:00:00Z"),
        endTime: new Date("2027-02-01T12:00:00Z"),
      },
    });

    await syncFromCalendar();

    expect(mockApplyReservationEditSideEffects).not.toHaveBeenCalled();
  });

  test("applyCalendarTimeChange が payment_race を返したとき拒否メールを送る", async () => {
    mockGetReservationByCalendarEventId.mockResolvedValue(
      reservationWith("UNPAID"),
    );
    mockApplyCalendarTimeChange.mockResolvedValue({
      success: false,
      reason: "payment_race",
    });

    const result = await syncFromCalendar();

    expect(mockApplyCalendarTimeChange).toHaveBeenCalledTimes(1);
    expect(mockSendCalendarSyncRejectionEmail).toHaveBeenCalledTimes(1);
    expect(result.updated).toBe(0);
  });
});
