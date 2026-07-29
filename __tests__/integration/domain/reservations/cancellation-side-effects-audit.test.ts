/**
 * `applyCancellationSideEffects` の副作用 outcome capture 検証 (CRITIC-6)。
 *
 * `AuditLog.metadata.sideEffects` に refund / gcal / customerEmail / adminEmail /
 * notification / smartLock それぞれの status (`ok / skipped / error`) と reason が
 * 記録されることを、実 DB 依存なしで確認する。
 *
 * 実 Postgres は不要 (Prisma 呼出は fetchReservationForSideEffects の findUnique
 * だけを facade level で mock、SettingsCommerce.findUnique も mock)。SERIAL_DB_TESTS への
 * 登録は不要。既存の cancellation-with-refund-policy.test.ts は refund 実挙動
 * (Refund child 書込 + PaymentStatus 遷移) の検証で、本 test は AuditLog 集約
 * metadata の shape 検証を担当する (責務分割)。
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { installErrorsServerMock } from "../../../mocks/errors-server";
import { installEmailLibDispatchMock } from "../../../support/email-lib-dispatch-mock";
import { installEmailRenderContextMock } from "../../../support/email-render-context-mock";

// ---------------------------------------------------------------------------
// Facade / external module mocks (順序: mock.module 宣言 → dynamic import)
// ---------------------------------------------------------------------------

// Prisma facade: reservation findUnique と settingsCommerce findUnique だけ本 test で使う。
const mockReservationFindUnique =
  mock<
    (args: { where: unknown; select: unknown }) => Promise<unknown | null>
  >();
const mockSettingsCommerceFindUnique = mock<
  (args: { where: unknown; select: unknown }) => Promise<unknown | null>
>(() => Promise.resolve(null));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: { findUnique: mockReservationFindUnique },
    settingsCommerce: { findUnique: mockSettingsCommerceFindUnique },
  },
}));

// Stripe refund command: 本物は advisory lock + Stripe API を叩くため full mock。
const mockRefundReservationPaymentCommand =
  mock<(input: unknown) => Promise<unknown>>();
mock.module("@/shared/domain/reservations/payment-commands", () => ({
  refundReservationPaymentCommand: (input: unknown) =>
    mockRefundReservationPaymentCommand(input),
}));

// GCal delete
const mockDeleteCalendarSync = mock<
  (
    reservationId: string,
    eventId: string,
  ) => Promise<{ success: true } | { success: false; error: string }>
>(() => Promise.resolve({ success: true }));
mock.module(
  "@/shared/domain/reservations/reservation-calendar-outbound",
  () => ({
    deleteCalendarSync: (rId: string, eId: string) =>
      mockDeleteCalendarSync(rId, eId),
  }),
);

// bulk 系 (series-outbound) は per-test で触らないが、mock.module の live binding
// 汚染を避けるため空 stub を置く。
mock.module("@/shared/domain/reservations/series-calendar-outbound", () => ({
  deleteGcalMaster: () => Promise.resolve(),
  getSeriesGcalMasterEventId: () => Promise.resolve(null),
  patchGcalMasterUntil: () => Promise.resolve(),
}));

// メール送信 (顧客 + 管理者)
type EmailResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: "disabled" }
  | { ok: false; reason: "error"; error: string };
const mockSendCancelled = mock<(data: unknown) => Promise<EmailResult>>(() =>
  Promise.resolve({ ok: true, messageId: "customer_msg_1" }),
);
const mockSendAdminNotification = mock<
  (data: unknown, action: string) => Promise<EmailResult>
>(() => Promise.resolve({ ok: true, messageId: "admin_msg_1" }));
installEmailLibDispatchMock({
  sendReservationCancelledEmail: (d: unknown) => mockSendCancelled(d),
  sendReservationAdminNotification: (d: unknown, action: string) =>
    mockSendAdminNotification(d, action),
  sendBulkReservationCancelledEmail: mock(() =>
    Promise.resolve({ ok: false, reason: "disabled" }),
  ),
  sendBulkAdminNotification: mock(() =>
    Promise.resolve({ ok: false, reason: "disabled" }),
  ),
});
installEmailRenderContextMock();

// SmartLock revoke
const mockRevokeSmartLock = mock<(reservationId: string) => Promise<void>>(() =>
  Promise.resolve(),
);
mock.module("@/shared/domain/smart-lock/revoke-passcode", () => ({
  revokeSmartLockPasscodesForReservation: (id: string) =>
    mockRevokeSmartLock(id),
}));

// Notification
const mockCreateNotification = mock<(input: unknown) => Promise<void>>(() =>
  Promise.resolve(),
);
mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: (input: unknown) => mockCreateNotification(input),
}));

// AuditLog: outcome capture assertion の対象。metadata を record する。
type AuditCallArg = {
  action: string;
  resource: string;
  resourceId?: string;
  newValue?: unknown;
  metadata?: {
    channel?: string;
    ip?: string | null;
    userAgent?: string | null;
    tokenFingerprint?: string;
    requiresRefund?: boolean;
    wasPaid?: boolean;
    sideEffects?: {
      refund?: { status: string; reason?: string };
      gcal?: { status: string; reason?: string };
      customerEmail?: { status: string; reason?: string };
      adminEmail?: { status: string; reason?: string };
      notification?: { status: string; reason?: string };
      smartLock?: { status: string; reason?: string };
    };
  };
};
const mockCreateAuditLogRecord =
  mock<(input: AuditCallArg) => Promise<unknown>>();
mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (input: AuditCallArg) =>
    mockCreateAuditLogRecord(input),
}));

// logError: skip 分岐等で発火する。fail 時のノイズを抑えるため noop。
// `...actual` re-export で safeFetch 等を残す（部分 mock は Export named not found）。
await installErrorsServerMock({
  logError: () => {},
  normalizeError: (err: unknown) =>
    err instanceof Error ? err : new Error(String(err)),
});

// fireAndForget: applyCancellationSideEffects は orchestrator 全体を fireAndForget
// でラップするため、テスト側で単一の pending promise を集めて drain する。
// 元関数は promise を drain するだけの fire-and-forget なので、失敗しても
// mockLogError に流すだけ (元関数と同じ握り潰し semantics)。
const pendingSideEffects: Promise<unknown>[] = [];
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (p: Promise<unknown>, _opts: unknown) => {
    pendingSideEffects.push(p.catch(() => {}));
  },
}));

// ---------------------------------------------------------------------------
// Dynamic imports (mock 登録後に本体をロード)
// ---------------------------------------------------------------------------
type SideEffectsModule =
  typeof import("@/shared/domain/reservations/cancellation-side-effects");
let applyCancellationSideEffects: SideEffectsModule["applyCancellationSideEffects"];

async function drainSideEffects(): Promise<void> {
  const pending = pendingSideEffects.splice(0);
  await Promise.all(pending);
}

const RESERVATION_ID = "rsv_test_critic6";

interface ReservationOverrides {
  paymentStatus?: string;
  stripePaymentIntentId?: string | null;
  googleCalendarEventId?: string | null;
  totalPrice?: number | null;
}

function reservationFixture(overrides: ReservationOverrides = {}): unknown {
  return {
    id: RESERVATION_ID,
    startTime: new Date("2026-08-15T10:00:00Z"),
    endTime: new Date("2026-08-15T12:00:00Z"),
    totalPrice: overrides.totalPrice ?? null,
    notes: null,
    icsSequence: 1,
    paymentStatus: overrides.paymentStatus ?? "UNPAID",
    stripePaymentIntentId: overrides.stripePaymentIntentId ?? null,
    googleCalendarEventId: overrides.googleCalendarEventId ?? null,
    guestLastName: null,
    guestFirstName: null,
    guestEmail: null,
    customer: {
      lastName: "山田",
      firstName: "太郎",
      companyName: null,
      email: "yamada@example.com",
    },
    space: {
      name: "テストスペース",
      addressDetail: null,
      location: { address: "東京都テスト区1-2-3" },
    },
  };
}

function baseInput() {
  return {
    reservationId: RESERVATION_ID,
    cancellationReason: "テスト理由",
    channel: "customer-mypage" as const,
    actorUserId: null,
    request: {
      ip: "203.0.113.10",
      userAgent: "Mozilla/5.0 (Test)",
      tokenFingerprint: null,
    },
  };
}

function findCancellationAudit(): AuditCallArg | undefined {
  const call = mockCreateAuditLogRecord.mock.calls.find(
    ([input]) =>
      input.resource === "reservation" && input.metadata?.sideEffects,
  );
  return call?.[0];
}

describe("applyCancellationSideEffects × sideEffects outcome capture (CRITIC-6)", () => {
  beforeEach(async () => {
    if (!applyCancellationSideEffects) {
      const mod =
        await import("@/shared/domain/reservations/cancellation-side-effects");
      applyCancellationSideEffects = mod.applyCancellationSideEffects;
    }

    mockReservationFindUnique.mockReset();
    mockSettingsCommerceFindUnique.mockReset();
    mockRefundReservationPaymentCommand.mockReset();
    mockDeleteCalendarSync.mockReset();
    mockSendCancelled.mockReset();
    mockSendAdminNotification.mockReset();
    mockRevokeSmartLock.mockReset();
    mockCreateNotification.mockReset();
    mockCreateAuditLogRecord.mockReset();
    pendingSideEffects.length = 0;

    // 既定 mock: happy path
    mockSettingsCommerceFindUnique.mockImplementation(() =>
      Promise.resolve(null),
    );
    mockRefundReservationPaymentCommand.mockImplementation(() =>
      Promise.resolve({
        refundId: "re_test",
        status: "succeeded",
        customerId: "cust_1",
        newPaymentStatus: "REFUNDED",
        cumulativeAmount: 5000,
        refundAmount: 5000,
      }),
    );
    mockDeleteCalendarSync.mockImplementation(() =>
      Promise.resolve({ success: true }),
    );
    mockSendCancelled.mockImplementation(() =>
      Promise.resolve({ ok: true, messageId: "customer_msg" }),
    );
    mockSendAdminNotification.mockImplementation(() =>
      Promise.resolve({ ok: true, messageId: "admin_msg" }),
    );
    mockRevokeSmartLock.mockImplementation(() => Promise.resolve());
    mockCreateNotification.mockImplementation(() => Promise.resolve());
    mockCreateAuditLogRecord.mockImplementation(() => Promise.resolve());
  });

  afterEach(async () => {
    // pending promise を drain せずに終了すると afterEach 直後に unhandled rejection
    // が出るケースがある。
    await drainSideEffects();
  });

  test("UNPAID + eventId 無し: refund/gcal は skipped、他は ok として metadata に記録される", async () => {
    mockReservationFindUnique.mockImplementation(() =>
      Promise.resolve(
        reservationFixture({
          paymentStatus: "UNPAID",
          googleCalendarEventId: null,
        }),
      ),
    );

    await applyCancellationSideEffects(baseInput());
    await drainSideEffects();

    const audit = findCancellationAudit();
    expect(audit).toBeDefined();
    const meta = audit!.metadata!;
    expect(meta.wasPaid).toBe(false);
    expect(meta.requiresRefund).toBe(false);

    const eff = meta.sideEffects!;
    expect(eff.refund).toEqual({ status: "skipped", reason: "notPaid" });
    expect(eff.gcal).toEqual({ status: "skipped", reason: "noEventId" });
    expect(eff.customerEmail?.status).toBe("ok");
    expect(eff.adminEmail?.status).toBe("ok");
    expect(eff.notification?.status).toBe("ok");
    expect(eff.smartLock?.status).toBe("ok");

    // Stripe は呼ばれない (UNPAID)
    expect(mockRefundReservationPaymentCommand).not.toHaveBeenCalled();
    // GCal も呼ばれない (eventId 無し)
    expect(mockDeleteCalendarSync).not.toHaveBeenCalled();
  });

  test("PAID + eventId 有り: 全副作用が ok として metadata に記録される", async () => {
    mockReservationFindUnique.mockImplementation(() =>
      Promise.resolve(
        reservationFixture({
          paymentStatus: "PAID",
          stripePaymentIntentId: "pi_test",
          googleCalendarEventId: "gcal_evt_1",
          totalPrice: 5000,
        }),
      ),
    );

    await applyCancellationSideEffects(baseInput());
    await drainSideEffects();

    const audit = findCancellationAudit();
    expect(audit).toBeDefined();
    const eff = audit!.metadata!.sideEffects!;

    expect(audit!.metadata!.wasPaid).toBe(true);
    expect(audit!.metadata!.requiresRefund).toBe(true);
    expect(eff.refund?.status).toBe("ok");
    expect(eff.gcal?.status).toBe("ok");
    expect(eff.customerEmail?.status).toBe("ok");
    expect(eff.adminEmail?.status).toBe("ok");
    expect(eff.notification?.status).toBe("ok");
    expect(eff.smartLock?.status).toBe("ok");
  });

  test("Resend suppression / 未設定 (email disabled) が customerEmail: skipped として観測される", async () => {
    mockReservationFindUnique.mockImplementation(() =>
      Promise.resolve(reservationFixture({ paymentStatus: "UNPAID" })),
    );
    mockSendCancelled.mockImplementation(() =>
      Promise.resolve({ ok: false, reason: "disabled" }),
    );
    mockSendAdminNotification.mockImplementation(() =>
      Promise.resolve({ ok: false, reason: "disabled" }),
    );

    await applyCancellationSideEffects(baseInput());
    await drainSideEffects();

    const audit = findCancellationAudit();
    const eff = audit!.metadata!.sideEffects!;
    expect(eff.customerEmail).toEqual({
      status: "skipped",
      reason: "disabled_or_suppressed",
    });
    expect(eff.adminEmail).toEqual({
      status: "skipped",
      reason: "disabled_or_suppressed",
    });
  });

  test("メール送信の Resend error は customerEmail: error として観測される", async () => {
    mockReservationFindUnique.mockImplementation(() =>
      Promise.resolve(reservationFixture({ paymentStatus: "UNPAID" })),
    );
    mockSendCancelled.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        reason: "error",
        error: "Resend rate limit",
      }),
    );

    await applyCancellationSideEffects(baseInput());
    await drainSideEffects();

    const audit = findCancellationAudit();
    const eff = audit!.metadata!.sideEffects!;
    expect(eff.customerEmail).toEqual({
      status: "error",
      reason: "Resend rate limit",
    });
    // 他の効果は影響を受けない (individual isolation)
    expect(eff.adminEmail?.status).toBe("ok");
    expect(eff.notification?.status).toBe("ok");
  });

  test("GCal delete の失敗は gcal: error として観測される (他 effect は継続)", async () => {
    mockReservationFindUnique.mockImplementation(() =>
      Promise.resolve(
        reservationFixture({
          paymentStatus: "UNPAID",
          googleCalendarEventId: "gcal_evt_bad",
        }),
      ),
    );
    mockDeleteCalendarSync.mockImplementation(() =>
      Promise.resolve({ success: false, error: "429 quota exceeded" }),
    );

    await applyCancellationSideEffects(baseInput());
    await drainSideEffects();

    const audit = findCancellationAudit();
    const eff = audit!.metadata!.sideEffects!;
    expect(eff.gcal).toEqual({
      status: "error",
      reason: "429 quota exceeded",
    });
    // 他 effect は継続実行
    expect(eff.customerEmail?.status).toBe("ok");
    expect(eff.notification?.status).toBe("ok");
    expect(eff.smartLock?.status).toBe("ok");
  });

  test("bulk suppress flag は skipped: suppressed_by_bulk として記録される", async () => {
    mockReservationFindUnique.mockImplementation(() =>
      Promise.resolve(
        reservationFixture({
          paymentStatus: "UNPAID",
          googleCalendarEventId: "gcal_evt_1",
        }),
      ),
    );

    await applyCancellationSideEffects({
      ...baseInput(),
      suppress: {
        customerEmail: true,
        adminEmail: true,
        gcalDelete: true,
      },
    });
    await drainSideEffects();

    const audit = findCancellationAudit();
    const eff = audit!.metadata!.sideEffects!;
    expect(eff.customerEmail).toEqual({
      status: "skipped",
      reason: "suppressed_by_bulk",
    });
    expect(eff.adminEmail).toEqual({
      status: "skipped",
      reason: "suppressed_by_bulk",
    });
    expect(eff.gcal).toEqual({
      status: "skipped",
      reason: "suppressed_by_bulk",
    });
    // suppressed でも notification は per-instance で動く
    expect(eff.notification?.status).toBe("ok");
  });

  test("SmartLock revoke の失敗は smartLock: error として観測される", async () => {
    mockReservationFindUnique.mockImplementation(() =>
      Promise.resolve(reservationFixture({ paymentStatus: "UNPAID" })),
    );
    // try/catch 前提: SwitchBot 側の通信例外を投げる
    mockRevokeSmartLock.mockImplementation(() =>
      Promise.reject(new Error("SwitchBot 401 unauthorized")),
    );

    await applyCancellationSideEffects(baseInput());
    await drainSideEffects();

    const audit = findCancellationAudit();
    const eff = audit!.metadata!.sideEffects!;
    expect(eff.smartLock?.status).toBe("error");
    expect(eff.smartLock?.reason).toBe("SwitchBot 401 unauthorized");
  });

  test("in-app notification 失敗は notification: error として観測される", async () => {
    mockReservationFindUnique.mockImplementation(() =>
      Promise.resolve(reservationFixture({ paymentStatus: "UNPAID" })),
    );
    mockCreateNotification.mockImplementation(() =>
      Promise.reject(new Error("prisma pool exhausted")),
    );

    await applyCancellationSideEffects(baseInput());
    await drainSideEffects();

    const audit = findCancellationAudit();
    const eff = audit!.metadata!.sideEffects!;
    expect(eff.notification?.status).toBe("error");
    expect(eff.notification?.reason).toBe("prisma pool exhausted");
    // 他 effect は継続
    expect(eff.customerEmail?.status).toBe("ok");
    expect(eff.smartLock?.status).toBe("ok");
  });
});
