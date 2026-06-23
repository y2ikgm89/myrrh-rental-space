/**
 * applyCancellationSideEffects（キャンセル後副作用の統合実行）の単体テスト。
 *
 * `cancellation-side-effects.ts` は会員 / ゲスト / 管理の全キャンセル経路が共有する
 * 副作用 SSoT。ここでは Prisma / 各 command / メール / GCal / fireAndForget の
 * 依存を mock.module で差し替え、以下を網羅検証する:
 *   - 予約が見つからない場合 no-op + logError
 *   - PAID × stripePaymentIntentId のみ refund 発火
 *   - googleCalendarEventId があるときのみ deleteCalendarSync
 *   - 顧客キャンセルメール + 管理者通知メールは常時発火
 *   - in-app 通知タイトルが requiresRefund で「要返金確認」に昇格
 *   - cancellationReason の有無で notification message が分岐
 *   - AuditLog metadata に channel/ip/userAgent/tokenFingerprint/requiresRefund/wasPaid が乗る
 *   - actorUserId / tokenFingerprint は条件付き spread
 *   - channel ラベルが通知タイトルに反映される
 *
 * fireAndForget は内部で `after()` を試し失敗時に detached 実行する。
 * `Promise.all([sendX()])` の引数構築時点で各 mock は同期的に呼ばれるため、
 * `await applyCancellationSideEffects(...)` 直後に call 集合をそのまま検証できる
 * （await や setImmediate のジャグリング不要）。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

// ---------------------------------------------------------------------------
// Mocks（モジュール解決の都合上、import より前に登録する）
// ---------------------------------------------------------------------------

const mockFindUnique = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve(null));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: { findUnique: mockFindUnique },
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

const mockRefund = mock<(reservationId: string) => Promise<unknown>>(() =>
  Promise.resolve({ ok: true }),
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

const mockSendCancelledEmail = mock<
  (data: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve({ ok: true }));
const mockSendAdminNotification = mock<
  (data: Record<string, unknown>, action: string) => Promise<unknown>
>(() => Promise.resolve({ ok: true }));
mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationCancelledEmail: mockSendCancelledEmail,
  sendReservationAdminNotification: mockSendAdminNotification,
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

import { applyCancellationSideEffects } from "@/shared/domain/reservations/cancellation-side-effects";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const RID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";

const baseReservation = {
  id: RID,
  startTime: new Date("2026-05-01T10:00:00Z"),
  endTime: new Date("2026-05-01T12:00:00Z"),
  totalPrice: 5000,
  notes: "備考",
  icsSequence: 2,
  paymentStatus: "UNPAID" as const,
  stripePaymentIntentId: null as string | null,
  googleCalendarEventId: null as string | null,
  guestLastName: null as string | null,
  guestFirstName: null as string | null,
  customer: {
    lastName: "山田",
    firstName: "太郎",
    companyName: null as string | null,
    email: "taro@example.com",
  },
  space: {
    name: "Studio A",
    addressDetail: "301号室",
    location: { address: "東京都新宿区1-2-3" },
  },
};

function baseInput(
  overrides: {
    channel?: "admin" | "customer-mypage" | "customer-token";
    actorUserId?: string | null;
    cancellationReason?: string | null;
    tokenFingerprint?: string | null;
  } = {},
) {
  // ?? は null をデフォルトへ置換してしまうため、テストで null を明示渡しできるよう
  // 「キーが存在するか」で分岐する（undefined のみデフォルトに置換）。
  return {
    reservationId: RID,
    cancellationReason:
      "cancellationReason" in overrides
        ? (overrides.cancellationReason ?? null)
        : "都合により",
    channel: overrides.channel ?? ("customer-token" as const),
    actorUserId: "actorUserId" in overrides ? overrides.actorUserId : null,
    request: {
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0 (Test)",
      tokenFingerprint:
        "tokenFingerprint" in overrides
          ? overrides.tokenFingerprint
          : "abcd1234efgh5678",
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("applyCancellationSideEffects", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockCreateAuditLog.mockReset();
    mockCreateNotification.mockReset();
    mockRefund.mockReset();
    mockDeleteCalendarSync.mockReset();
    mockSendCancelledEmail.mockReset();
    mockSendAdminNotification.mockReset();
    mockLogError.mockReset();
    mockFindUnique.mockResolvedValue(null);
    mockCreateAuditLog.mockResolvedValue(undefined);
    mockCreateNotification.mockResolvedValue(undefined);
    mockRefund.mockResolvedValue({ ok: true });
    mockDeleteCalendarSync.mockResolvedValue(undefined);
    mockSendCancelledEmail.mockResolvedValue({ ok: true });
    mockSendAdminNotification.mockResolvedValue({ ok: true });
  });

  test("予約が見つからない場合: 副作用は一切発火せず logError が呼ばれる", async () => {
    mockFindUnique.mockResolvedValue(null);

    await applyCancellationSideEffects(baseInput());

    expect(mockRefund).not.toHaveBeenCalled();
    expect(mockDeleteCalendarSync).not.toHaveBeenCalled();
    expect(mockSendCancelledEmail).not.toHaveBeenCalled();
    expect(mockSendAdminNotification).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockCreateAuditLog).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockLogError.mock.calls[0]?.[1]).toMatchObject({
      category: "DATABASE",
      context: {
        operation: "applyCancellationSideEffects",
        reservationId: RID,
      },
    });
  });

  test("PAID × stripePaymentIntentId: 自動返金が発火し通知タイトルが昇格", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseReservation,
      paymentStatus: "PAID",
      stripePaymentIntentId: "pi_test_123",
    });

    await applyCancellationSideEffects(baseInput());

    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund).toHaveBeenCalledWith(RID);

    // notification title が「要返金確認」へ昇格
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification.mock.calls[0]?.[0]).toMatchObject({
      title: "PAID 予約のキャンセル — 要返金確認",
      message: "理由: 都合により",
    });

    // audit metadata に wasPaid / requiresRefund が乗る
    expect(mockCreateAuditLog).toHaveBeenCalledTimes(1);
    expect(mockCreateAuditLog.mock.calls[0]?.[0]).toMatchObject({
      metadata: { wasPaid: true, requiresRefund: true },
    });
  });

  test("PAID だが stripePaymentIntentId が null: 返金は呼ばれない（手動返金扱い）", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseReservation,
      paymentStatus: "PAID",
      stripePaymentIntentId: null,
    });

    await applyCancellationSideEffects(baseInput());

    expect(mockRefund).not.toHaveBeenCalled();
    expect(mockCreateAuditLog.mock.calls[0]?.[0]).toMatchObject({
      metadata: { wasPaid: true, requiresRefund: false },
    });
    // 要返金確認 ではなく通常タイトル
    expect(mockCreateNotification.mock.calls[0]?.[0]).toMatchObject({
      title: expect.stringContaining("予約キャンセル"),
    });
  });

  test("UNPAID: 返金は呼ばれず wasPaid=false", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseReservation,
      paymentStatus: "UNPAID",
      stripePaymentIntentId: null,
    });

    await applyCancellationSideEffects(baseInput());

    expect(mockRefund).not.toHaveBeenCalled();
    expect(mockCreateAuditLog.mock.calls[0]?.[0]).toMatchObject({
      metadata: { wasPaid: false, requiresRefund: false },
    });
  });

  test("googleCalendarEventId あり: deleteCalendarSync が発火", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseReservation,
      googleCalendarEventId: "gcal-event-abc",
    });

    await applyCancellationSideEffects(baseInput());

    expect(mockDeleteCalendarSync).toHaveBeenCalledTimes(1);
    expect(mockDeleteCalendarSync).toHaveBeenCalledWith(RID, "gcal-event-abc");
  });

  test("googleCalendarEventId なし: deleteCalendarSync は呼ばれない", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseReservation,
      googleCalendarEventId: null,
    });

    await applyCancellationSideEffects(baseInput());

    expect(mockDeleteCalendarSync).not.toHaveBeenCalled();
  });

  test("顧客キャンセルメール + 管理者通知メールは常時発火", async () => {
    mockFindUnique.mockResolvedValue(baseReservation);

    await applyCancellationSideEffects(baseInput());

    expect(mockSendCancelledEmail).toHaveBeenCalledTimes(1);
    expect(mockSendAdminNotification).toHaveBeenCalledTimes(1);
    expect(mockSendAdminNotification).toHaveBeenCalledWith(
      expect.any(Object),
      "cancel",
    );
    // payload に customer 情報 + 整形済 location（base + detail）が含まれる
    const payload = mockSendCancelledEmail.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(payload).toMatchObject({
      reservationId: RID,
      customerEmail: "taro@example.com",
      customerName: "山田 太郎",
      spaceName: "Studio A",
      location: "東京都新宿区1-2-3 301号室",
      notes: "備考",
    });
  });

  test("cancellationReason が null のとき通知 message は『理由: 入力なし』", async () => {
    mockFindUnique.mockResolvedValue(baseReservation);

    await applyCancellationSideEffects(baseInput({ cancellationReason: null }));

    expect(mockCreateNotification.mock.calls[0]?.[0]).toMatchObject({
      message: "理由: 入力なし",
    });
  });

  test("channel='admin': 通知タイトルに『管理者』が反映され CANCELLED_BY も ADMIN", async () => {
    mockFindUnique.mockResolvedValue(baseReservation);

    await applyCancellationSideEffects(
      baseInput({ channel: "admin", actorUserId: USER_ID }),
    );

    expect(mockCreateNotification.mock.calls[0]?.[0]).toMatchObject({
      title: "予約キャンセル（管理者）",
    });
    expect(mockCreateAuditLog.mock.calls[0]?.[0]).toMatchObject({
      userId: USER_ID,
      newValue: { cancelledByType: "ADMIN" },
      metadata: { channel: "admin" },
    });
  });

  test("channel='customer-mypage': タイトルは『顧客（マイページ）』+ CUSTOMER_MYPAGE", async () => {
    mockFindUnique.mockResolvedValue(baseReservation);

    await applyCancellationSideEffects(
      baseInput({ channel: "customer-mypage", actorUserId: USER_ID }),
    );

    expect(mockCreateNotification.mock.calls[0]?.[0]).toMatchObject({
      title: "予約キャンセル（顧客（マイページ））",
    });
    expect(mockCreateAuditLog.mock.calls[0]?.[0]).toMatchObject({
      newValue: { cancelledByType: "CUSTOMER_MYPAGE" },
    });
  });

  test("channel='customer-token': CUSTOMER_TOKEN + tokenFingerprint が metadata に乗る", async () => {
    mockFindUnique.mockResolvedValue(baseReservation);

    await applyCancellationSideEffects(
      baseInput({
        channel: "customer-token",
        actorUserId: null,
        tokenFingerprint: "deadbeef00000000",
      }),
    );

    const auditCall = mockCreateAuditLog.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(auditCall).toMatchObject({
      newValue: { cancelledByType: "CUSTOMER_TOKEN" },
      metadata: {
        channel: "customer-token",
        ip: "203.0.113.10",
        userAgent: "Mozilla/5.0 (Test)",
        tokenFingerprint: "deadbeef00000000",
      },
    });
    // ゲスト経路では userId キーが存在しない（条件付き spread）
    expect(auditCall).not.toHaveProperty("userId");
  });

  test("tokenFingerprint=null: metadata に tokenFingerprint キーを焼かない（条件付き spread）", async () => {
    mockFindUnique.mockResolvedValue(baseReservation);

    await applyCancellationSideEffects(
      baseInput({ channel: "admin", tokenFingerprint: null }),
    );

    const meta = (
      mockCreateAuditLog.mock.calls[0]?.[0] as {
        metadata?: Record<string, unknown>;
      }
    ).metadata;
    expect(meta).not.toHaveProperty("tokenFingerprint");
    expect(meta).toMatchObject({ ip: "203.0.113.10" });
  });

  test("guestName が customer 氏名と異なる場合 payload に guestName が乗る", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseReservation,
      guestLastName: "鈴木",
      guestFirstName: "花子",
    });

    await applyCancellationSideEffects(baseInput());

    expect(mockSendCancelledEmail.mock.calls[0]?.[0]).toMatchObject({
      guestName: "鈴木 花子",
    });
  });

  test("guestName が customer 氏名と同じ場合 payload に guestName キーが無い", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseReservation,
      guestLastName: "山田",
      guestFirstName: "太郎",
    });

    await applyCancellationSideEffects(baseInput());

    const payload = mockSendCancelledEmail.mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(payload).not.toHaveProperty("guestName");
  });
});
