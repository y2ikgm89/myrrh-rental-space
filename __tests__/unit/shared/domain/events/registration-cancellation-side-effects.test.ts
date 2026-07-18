/**
 * applyEventRegistrationCancellationSideEffects の単体テスト。
 *
 * MYPAGE-EVENT-02: reservation cancel と対称の Stripe 自動返金を event 側にも
 * 導入した (`registration-cancellation-side-effects.ts` §1)。ここでは Prisma /
 * refund command / メール / 通知 / 監査 / fireAndForget の依存を mock.module で
 * 差し替え、以下を網羅検証する:
 *   - PAID × stripePaymentIntentId のみ auto refund 発火 + 通知タイトル昇格
 *   - PAID だが stripePaymentIntentId=null: refund skip、wasPaid=true / requiresRefund=false
 *   - UNPAID: refund skip、wasPaid=false / requiresRefund=false
 *   - PARTIALLY_REFUNDED × stripePaymentIntentId: auto refund 発火 (残額分)
 *   - Policy refundRate=0% → refund skip かつ通知タイトルは「要返金確認」を維持
 *
 * fireAndForget は同期的な発火モック (Promise を discard) で置き換え、
 * `applyEventRegistrationCancellationSideEffects` 実行直後に mock call 集合を
 * そのまま検証できるようにする (reservation side-effects test と同型)。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

// ---------------------------------------------------------------------------
// Mocks（モジュール解決の都合上、import より前に登録する）
// ---------------------------------------------------------------------------

const mockFindUnique = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve(null));

const mockSettingsFindUnique = mock<
  (args: Record<string, unknown>) => Promise<{ refundPolicy: unknown } | null>
>(() => Promise.resolve(null));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    eventRegistration: { findUnique: mockFindUnique },
    settings: { findUnique: mockSettingsFindUnique },
  },
}));

// fireAndForget を「発火した Promise を即座に discard」する同期モックに差し替える。
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => undefined);
  },
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

// MYPAGE-EVENT-02: 対象の refund command。actorType=AUTO_ON_CANCEL で呼ばれる。
const mockRefund = mock<
  (input: {
    registrationId: string;
    amount?: number;
    actorType: string;
    request?: { ip: string | null; userAgent: string | null };
  }) => Promise<unknown>
>(() => Promise.resolve({ ok: true }));
mock.module("@/shared/domain/events/payment-commands", () => ({
  refundEventRegistrationPaymentCommand: mockRefund,
}));

const mockGetDetails = mock<(registrationId: string) => Promise<unknown>>(() =>
  Promise.resolve({
    eventTitle: "Test Event",
    startTime: new Date("2027-01-01T10:00:00Z"),
    endTime: new Date("2027-01-01T12:00:00Z"),
    location: "Studio A",
    capacity: 50,
    confirmedCount: 10,
    format: "IN_PERSON",
    meetingUrl: null,
  }),
);
mock.module("@/shared/domain/events/registration-queries", () => ({
  getEventRegistrationDetailsForEmail: mockGetDetails,
}));

// Waitlist offer 経路は本テストの対象外 (promoted=null で通す)。resolve stub のみ。
mock.module("@/shared/domain/events/waitlist-queries", () => ({
  getEventWaitlistOfferPaymentContext: mock(() => Promise.resolve(null)),
}));

const mockSendCancelledEmail = mock<
  (data: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve({ ok: true }));
const mockSendAdminNotification = mock<
  (data: Record<string, unknown>, action: string) => Promise<unknown>
>(() => Promise.resolve({ ok: true }));
mock.module("@/shared/lib/email/event-emails", () => ({
  sendEventRegistrationCancelled: mockSendCancelledEmail,
  sendEventAdminNotification: mockSendAdminNotification,
}));

mock.module("@/shared/lib/email/event-waitlist-emails", () => ({
  sendEventWaitlistOffered: mock(() => Promise.resolve({ ok: true })),
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

import {
  applyEventRegistrationCancellationSideEffects,
  type EventCancellationSideEffectInput,
} from "@/shared/domain/events/registration-cancellation-side-effects";

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const RID = "cm60x9k3p0000qzrm8f3a1b2c";

type RegistrationFixture = {
  id: string;
  eventId: string;
  name: string;
  email: string | null;
  quantity: number;
  icsSequence: number;
  paymentStatus: "UNPAID" | "PAID" | "PARTIALLY_REFUNDED";
  stripePaymentIntentId: string | null;
  paidAmount: number | null;
  event: { title: string };
  slot: { startAt: Date };
};

const baseRegistration: RegistrationFixture = {
  id: RID,
  eventId: "evt-001",
  name: "山田太郎",
  email: "taro@example.com",
  quantity: 1,
  icsSequence: 2,
  paymentStatus: "UNPAID",
  stripePaymentIntentId: null,
  paidAmount: null,
  event: { title: "Test Event" },
  // 十分先の未来 (policy tier 100% 該当帯) にして「policy 未設定なら残額全額返金」
  // fallback path に流す。個別テストで override 可能。
  slot: { startAt: new Date("2099-01-01T10:00:00Z") },
};

function baseInput(
  overrides: Partial<EventCancellationSideEffectInput> = {},
): EventCancellationSideEffectInput {
  return {
    registrationId: RID,
    channel: "customer-mypage",
    actorUserId: null,
    request: {
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0 (Test)",
    },
    promoted: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("applyEventRegistrationCancellationSideEffects — MYPAGE-EVENT-02 refund symmetry", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockSettingsFindUnique.mockReset();
    mockCreateAuditLog.mockReset();
    mockCreateNotification.mockReset();
    mockRefund.mockReset();
    mockSendCancelledEmail.mockReset();
    mockSendAdminNotification.mockReset();
    mockLogError.mockReset();

    mockFindUnique.mockResolvedValue(null);
    mockSettingsFindUnique.mockResolvedValue(null);
    mockCreateAuditLog.mockResolvedValue(undefined);
    mockCreateNotification.mockResolvedValue(undefined);
    mockRefund.mockResolvedValue({ ok: true });
    mockSendCancelledEmail.mockResolvedValue({ ok: true });
    mockSendAdminNotification.mockResolvedValue({ ok: true });
  });

  test("申込が見つからない場合: 副作用は一切発火せず logError が呼ばれる", async () => {
    mockFindUnique.mockResolvedValue(null);

    await applyEventRegistrationCancellationSideEffects(baseInput());

    expect(mockRefund).not.toHaveBeenCalled();
    expect(mockSendCancelledEmail).not.toHaveBeenCalled();
    expect(mockSendAdminNotification).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
    expect(mockCreateAuditLog).not.toHaveBeenCalled();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("PAID × stripePaymentIntentId: 自動返金が発火し通知タイトルが昇格", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseRegistration,
      paymentStatus: "PAID",
      stripePaymentIntentId: "pi_test_123",
      paidAmount: 5000,
    });

    await applyEventRegistrationCancellationSideEffects(baseInput());

    expect(mockRefund).toHaveBeenCalledTimes(1);
    // MYPAGE-EVENT-02: request context (ip / userAgent) を refund へ継承する
    expect(mockRefund).toHaveBeenCalledWith({
      registrationId: RID,
      actorType: "AUTO_ON_CANCEL",
      request: { ip: "203.0.113.10", userAgent: "Mozilla/5.0 (Test)" },
    });

    // 通知タイトルが「要返金確認」へ昇格 (Reservation 側と対称)
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification.mock.calls[0]?.[0]).toMatchObject({
      title: "PAID イベント申込のキャンセル — 要返金確認",
    });

    // AuditLog metadata に wasPaid / requiresRefund が乗る
    expect(mockCreateAuditLog).toHaveBeenCalledTimes(1);
    expect(mockCreateAuditLog.mock.calls[0]?.[0]).toMatchObject({
      metadata: { wasPaid: true, requiresRefund: true },
    });
  });

  test("PARTIALLY_REFUNDED × stripePaymentIntentId: 追加返金が発火する", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseRegistration,
      paymentStatus: "PARTIALLY_REFUNDED",
      stripePaymentIntentId: "pi_test_partial",
      paidAmount: 5000,
    });

    await applyEventRegistrationCancellationSideEffects(baseInput());

    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockCreateAuditLog.mock.calls[0]?.[0]).toMatchObject({
      metadata: { wasPaid: true, requiresRefund: true },
    });
  });

  test("PAID だが stripePaymentIntentId=null: 返金は呼ばれない (手動返金扱い)", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseRegistration,
      paymentStatus: "PAID",
      stripePaymentIntentId: null,
      paidAmount: 5000,
    });

    await applyEventRegistrationCancellationSideEffects(baseInput());

    expect(mockRefund).not.toHaveBeenCalled();
    expect(mockCreateAuditLog.mock.calls[0]?.[0]).toMatchObject({
      metadata: { wasPaid: true, requiresRefund: false },
    });
    // 通常タイトル
    expect(mockCreateNotification.mock.calls[0]?.[0]).toMatchObject({
      title: expect.stringContaining("イベント申込キャンセル"),
    });
  });

  test("UNPAID: 返金は呼ばれず wasPaid=false", async () => {
    mockFindUnique.mockResolvedValue({
      ...baseRegistration,
      paymentStatus: "UNPAID",
      stripePaymentIntentId: null,
    });

    await applyEventRegistrationCancellationSideEffects(baseInput());

    expect(mockRefund).not.toHaveBeenCalled();
    expect(mockCreateAuditLog.mock.calls[0]?.[0]).toMatchObject({
      metadata: { wasPaid: false, requiresRefund: false },
    });
  });

  test("Policy refundRate=0% → refund skip かつ「要返金確認」通知タイトル維持", async () => {
    // policy: 24h 未満は 0%、default も 0%。slot.startAt を「1h 後」に置いて 0% 帯に落とす。
    mockSettingsFindUnique.mockResolvedValue({
      refundPolicy: {
        tiers: [{ hoursBefore: 24, refundRate: 100 }],
        defaultRefundRate: 0,
      },
    });
    mockFindUnique.mockResolvedValue({
      ...baseRegistration,
      paymentStatus: "PAID",
      stripePaymentIntentId: "pi_test_zero",
      paidAmount: 5000,
      slot: { startAt: new Date(Date.now() + 60 * 60 * 1000) }, // 1h ahead
    });

    await applyEventRegistrationCancellationSideEffects(baseInput());

    // refund は呼ばれない
    expect(mockRefund).not.toHaveBeenCalled();

    // 通知タイトルは「要返金確認」を維持 (運用側の手動対応を促す)
    expect(mockCreateNotification.mock.calls[0]?.[0]).toMatchObject({
      title: "PAID イベント申込のキャンセル — 要返金確認",
    });
    expect(mockCreateAuditLog.mock.calls[0]?.[0]).toMatchObject({
      metadata: { wasPaid: true, requiresRefund: true },
    });

    // 「policy refund rate is 0%」の logError が 1 件出る (skip 監査用)
    expect(mockLogError.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  test("Policy が tier 適用結果 100% → amount 明示で refund 発火", async () => {
    // policy: 168h (7d) 前まで 100%。slot は十分先 (baseRegistration 既定=2099年) で 100% 帯。
    mockSettingsFindUnique.mockResolvedValue({
      refundPolicy: {
        tiers: [{ hoursBefore: 168, refundRate: 100 }],
        defaultRefundRate: 0,
      },
    });
    mockFindUnique.mockResolvedValue({
      ...baseRegistration,
      paymentStatus: "PAID",
      stripePaymentIntentId: "pi_test_full",
      paidAmount: 5000,
    });

    await applyEventRegistrationCancellationSideEffects(baseInput());

    expect(mockRefund).toHaveBeenCalledTimes(1);
    expect(mockRefund).toHaveBeenCalledWith({
      registrationId: RID,
      actorType: "AUTO_ON_CANCEL",
      request: { ip: "203.0.113.10", userAgent: "Mozilla/5.0 (Test)" },
      amount: 5000,
    });
  });
});
