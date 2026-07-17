/**
 * applyBulkCancellationSideEffects（series 一括キャンセルの副作用統一実行）の単体テスト。
 *
 * Phase B.2 task 12: 個々の instance 副作用（顧客/管理者メール・GCal instance delete）を
 * suppress した上で、series 単位の集約メール・master GCal 操作（scope 分岐）・
 * 集約 AuditLog を 1 回ずつ発火することを検証する
 * （Codex fix 3599414659 / spec §4.5 — per-instance の 2N 通メールスパムを根絶する）。
 *
 * 依存の mock 差し替えは `cancellation-side-effects.test.ts` と同型
 * （rules/testing-unit.md: mock.module を import 前に登録 → 動的 import）。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

// ---------------------------------------------------------------------------
// Mocks（モジュール解決の都合上、import より前に登録する）
// ---------------------------------------------------------------------------

const mockReservationFindUnique = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve(null));
const mockReservationFindMany = mock<
  (args: Record<string, unknown>) => Promise<unknown[]>
>(() => Promise.resolve([]));
const mockSeriesFindUnique = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve(null));
const mockSettingsFindUnique = mock<
  (args: Record<string, unknown>) => Promise<{ refundPolicy: unknown } | null>
>(() => Promise.resolve(null));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: {
      findUnique: mockReservationFindUnique,
      findMany: mockReservationFindMany,
    },
    reservationSeries: { findUnique: mockSeriesFindUnique },
    settings: { findUnique: mockSettingsFindUnique },
  },
}));

// fireAndForget は next/server の after() を呼ぶため、テスト環境では no-op で
// 「リクエストスコープ外」フォールバックを安定化させる。
mock.module("next/server", () => ({
  after: () => {},
}));

const mockCreateAuditLog = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());
mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mockCreateAuditLog,
}));

const mockCreateNotification = mock<
  (input: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());
mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mockCreateNotification,
}));

const mockRefund = mock<(input: Record<string, unknown>) => Promise<unknown>>(
  () => Promise.resolve({ ok: true }),
);
mock.module("@/shared/domain/reservations/payment-commands", () => ({
  refundReservationPaymentCommand: mockRefund,
}));

const mockDeleteCalendarSync = mock<
  (reservationId: string, eventId: string) => Promise<void>
>(() => Promise.resolve());
mock.module("@/shared/lib/calendar-sync/outbound", () => ({
  deleteCalendarSync: mockDeleteCalendarSync,
}));

const mockGetSeriesGcalMasterEventId = mock<
  (seriesId: string) => Promise<string | null>
>(() => Promise.resolve(null));
const mockPatchGcalMasterUntil = mock<
  (input: {
    masterEventId: string;
    seriesId: string;
    until: Date;
  }) => Promise<void>
>(() => Promise.resolve());
const mockDeleteGcalMaster = mock<(masterEventId: string) => Promise<void>>(
  () => Promise.resolve(),
);
mock.module("@/shared/lib/calendar-sync/series-outbound", () => ({
  getSeriesGcalMasterEventId: mockGetSeriesGcalMasterEventId,
  patchGcalMasterUntil: mockPatchGcalMasterUntil,
  deleteGcalMaster: mockDeleteGcalMaster,
}));

const mockSendCancelledEmail = mock<
  (data: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve({ ok: true }));
const mockSendAdminNotification = mock<
  (data: Record<string, unknown>, action: string) => Promise<unknown>
>(() => Promise.resolve({ ok: true }));
const mockSendBulkReservationCancelledEmail = mock<
  (data: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve({ ok: true }));
const mockSendBulkAdminNotification = mock<
  (data: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve({ ok: true }));
mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationCancelledEmail: mockSendCancelledEmail,
  sendReservationAdminNotification: mockSendAdminNotification,
  sendBulkReservationCancelledEmail: mockSendBulkReservationCancelledEmail,
  sendBulkAdminNotification: mockSendBulkAdminNotification,
}));

const mockLogError = mock<(err: Error, ctx: Record<string, unknown>) => void>(
  () => {},
);
mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  normalizeError: (err: unknown) =>
    err instanceof Error ? err : new Error(String(err)),
  ErrorCategory: {
    DATABASE: "DATABASE",
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    AUTHORIZATION: "AUTHORIZATION",
    CACHE: "CACHE",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    LOW: "LOW",
    MEDIUM: "MEDIUM",
    HIGH: "HIGH",
    CRITICAL: "CRITICAL",
  },
}));

// ---------------------------------------------------------------------------
// SUT を mock 登録後に import
// ---------------------------------------------------------------------------

import { applyBulkCancellationSideEffects } from "@/shared/domain/reservations/cancellation-side-effects";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const SERIES_ID = "33333333-3333-4333-8333-333333333333";
const MASTER_EVENT_ID = "gcal-master-abc";
const NOW = new Date("2026-07-17T00:00:00Z");

const baseReservation = {
  id: "unused",
  startTime: new Date("2026-05-01T10:00:00Z"),
  endTime: new Date("2026-05-01T12:00:00Z"),
  totalPrice: 5000,
  notes: null,
  icsSequence: 0,
  paymentStatus: "UNPAID",
  stripePaymentIntentId: null,
  googleCalendarEventId: null,
  guestLastName: null,
  guestFirstName: null,
  guestEmail: null,
  customer: {
    lastName: "山田",
    firstName: "太郎",
    companyName: null,
    email: "taro@example.com",
  },
  space: {
    name: "Studio A",
    addressDetail: null,
    location: { address: "東京都新宿区1-2-3" },
  },
};

const baseSeries = {
  customer: { lastName: "山田", firstName: "太郎", email: "taro@example.com" },
  space: { name: "Studio A" },
};

function makeReservationIds(count: number): string[] {
  return Array.from(
    { length: count },
    (_, i) => `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`,
  );
}

function baseInput(overrides: {
  reservationIds: string[];
  scope: "this-and-following" | "series-all";
  cancellationReason?: string;
}): Parameters<typeof applyBulkCancellationSideEffects>[0] {
  return {
    reservationIds: overrides.reservationIds,
    scope: overrides.scope,
    seriesId: SERIES_ID,
    channel: "admin",
    ...(overrides.cancellationReason !== undefined
      ? { cancellationReason: overrides.cancellationReason }
      : {}),
    request: { ip: "203.0.113.10", userAgent: "Mozilla/5.0 (Test)" },
    now: NOW,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("applyBulkCancellationSideEffects (Phase B.2 task 12)", () => {
  beforeEach(() => {
    mockReservationFindUnique.mockReset();
    mockReservationFindMany.mockReset();
    mockSeriesFindUnique.mockReset();
    mockSettingsFindUnique.mockReset();
    mockCreateAuditLog.mockReset();
    mockCreateNotification.mockReset();
    mockRefund.mockReset();
    mockDeleteCalendarSync.mockReset();
    mockGetSeriesGcalMasterEventId.mockReset();
    mockPatchGcalMasterUntil.mockReset();
    mockDeleteGcalMaster.mockReset();
    mockSendCancelledEmail.mockReset();
    mockSendAdminNotification.mockReset();
    mockSendBulkReservationCancelledEmail.mockReset();
    mockSendBulkAdminNotification.mockReset();
    mockLogError.mockReset();

    mockReservationFindUnique.mockResolvedValue(baseReservation);
    mockReservationFindMany.mockResolvedValue([
      {
        startTime: baseReservation.startTime,
        endTime: baseReservation.endTime,
      },
    ]);
    mockSeriesFindUnique.mockResolvedValue(baseSeries);
    mockSettingsFindUnique.mockResolvedValue(null);
    mockCreateAuditLog.mockResolvedValue(undefined);
    mockCreateNotification.mockResolvedValue(undefined);
    mockRefund.mockResolvedValue({ ok: true });
    mockDeleteCalendarSync.mockResolvedValue(undefined);
    mockGetSeriesGcalMasterEventId.mockResolvedValue(MASTER_EVENT_ID);
    mockPatchGcalMasterUntil.mockResolvedValue(undefined);
    mockDeleteGcalMaster.mockResolvedValue(undefined);
    mockSendCancelledEmail.mockResolvedValue({ ok: true });
    mockSendAdminNotification.mockResolvedValue({ ok: true });
    mockSendBulkReservationCancelledEmail.mockResolvedValue({ ok: true });
    mockSendBulkAdminNotification.mockResolvedValue({ ok: true });
  });

  test("10 instance の series-all cancel → 顧客メール 0 (per-instance) + 1 (集約)、GCal delete 0 + 1 (master)", async () => {
    const ids = makeReservationIds(10);

    await applyBulkCancellationSideEffects(
      baseInput({
        reservationIds: ids,
        scope: "series-all",
        cancellationReason: "都合により",
      }),
    );

    // per-instance 副作用: findUnique が id 数分呼ばれる（for-await 順次実行の傍証）
    expect(mockReservationFindUnique).toHaveBeenCalledTimes(10);

    // per-instance メール/GCal delete は suppress により 0 回
    expect(mockSendCancelledEmail).not.toHaveBeenCalled();
    expect(mockSendAdminNotification).not.toHaveBeenCalled();
    expect(mockDeleteCalendarSync).not.toHaveBeenCalled();

    // 集約メールは顧客向け・管理者向け 各 1 回
    expect(mockSendBulkReservationCancelledEmail).toHaveBeenCalledTimes(1);
    expect(mockSendBulkAdminNotification).toHaveBeenCalledTimes(1);
    const bulkEmailPayload =
      mockSendBulkReservationCancelledEmail.mock.calls[0]?.[0];
    expect(bulkEmailPayload).toMatchObject({
      seriesId: SERIES_ID,
      customerEmail: "taro@example.com",
      customerName: "山田 太郎",
      spaceName: "Studio A",
      reason: "都合により",
    });

    // master GCal: series-all は delete のみ、patch(UNTIL) は呼ばれない
    expect(mockDeleteGcalMaster).toHaveBeenCalledTimes(1);
    expect(mockDeleteGcalMaster).toHaveBeenCalledWith(MASTER_EVENT_ID);
    expect(mockPatchGcalMasterUntil).not.toHaveBeenCalled();

    // 集約 AuditLog: resource="reservation_series" のレコードが 1 回書かれる
    // （per-instance AuditLog は suppress 対象外のため別途 10 回発火するが、
    //   本テストは集約レコードの存在のみを検証する）
    const seriesAuditCalls = mockCreateAuditLog.mock.calls.filter(
      (call) => call[0]?.["resource"] === "reservation_series",
    );
    expect(seriesAuditCalls).toHaveLength(1);
    expect(seriesAuditCalls[0]?.[0]).toMatchObject({
      resource: "reservation_series",
      resourceId: SERIES_ID,
      newValue: { scope: "series-all", cancelledIds: ids },
    });
  });

  test("this-and-following → GCal events.patch(newUNTIL) が呼ばれ、events.delete は呼ばれない", async () => {
    const ids = makeReservationIds(2);

    await applyBulkCancellationSideEffects(
      baseInput({ reservationIds: ids, scope: "this-and-following" }),
    );

    expect(mockPatchGcalMasterUntil).toHaveBeenCalledTimes(1);
    expect(mockPatchGcalMasterUntil).toHaveBeenCalledWith({
      masterEventId: MASTER_EVENT_ID,
      seriesId: SERIES_ID,
      until: NOW,
    });
    expect(mockDeleteGcalMaster).not.toHaveBeenCalled();

    // 集約 AuditLog にも scope="this-and-following" が反映される
    const seriesAuditCalls = mockCreateAuditLog.mock.calls.filter(
      (call) => call[0]?.["resource"] === "reservation_series",
    );
    expect(seriesAuditCalls[0]?.[0]).toMatchObject({
      newValue: { scope: "this-and-following" },
    });
  });
});
