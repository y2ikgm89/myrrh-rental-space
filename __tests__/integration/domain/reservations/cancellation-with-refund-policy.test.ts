/**
 * `applyCancellationSideEffects` × `Settings.refundPolicy` の実 DB 統合テスト
 * (task #9 PR#5 A-2)。
 *
 * 検証対象 (unit test は Prisma / refund command / Settings を全 mock するため、
 * 「実際に refundPolicy JSON カラムから読んだ値 → calculateRefundAmount →
 * refundReservationPaymentCommand の Refund child table 書込」まで通す経路は
 * 実 DB 統合でしか検証できない):
 *
 * 1. policy 未設定 (Settings.refundPolicy = null / row 未 create)
 *    → 残額全額返金 (amount undefined pass through、後方互換)
 * 2. policy 設定あり (168h=100%): 200h 前予約 → 全額返金
 * 3. policy 設定あり (72h=50%): 100h 前予約 → 半額返金 (Refund child amount)
 * 4. policy 設定あり (defaultRate=0%): 24h 前予約 → refund skip + logError 発火
 * 5. policy shape 破損 → parseRefundPolicy 経由で null に fallback → 全額返金
 * 6. Refund child table に amount / refundedByType=AUTO_ON_CANCEL / reservationId 記録
 * 7. AuditLog metadata に wasPaid=true / requiresRefund=true 記録
 *
 * == 実行条件 ==
 * 実 Postgres 必須。`bun run test:integration` は docker-compose test-db を自動起動。
 * `expect(promise).rejects` は Bun 1.3.14 で hang するため try/catch pattern を使う
 * (memory/feedback_bun-rejects-hang-and-npm-script-args)。
 *
 * == fireAndForget 対応 ==
 * `applyCancellationSideEffects` は refund / GCal / email / notification / audit を
 * 全て `fireAndForget` で detach する。テストでは fireAndForget を差し替えて、
 * 発火した Promise を配列に集めておき、applyCancellationSideEffects 完了後に
 * `await Promise.all(pending)` してから assertion する (実 DB refund の完了保証)。
 */

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";

// preload の DATABASE_URL 上書きを、gateway import 前に実 TEST_DB へ向け直す。
// interactive tx の並行度は refund-command test と同じ 20/60s に揃える (advisory lock
// 728355 で refund は serialize されるが、Settings 読取と cancellation flow の
// 同時実行を想定して枯渇マージンを確保)。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  const url = new URL(TEST_DB_URL);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", "20");
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", "60");
  }
  process.env["DATABASE_URL"] = url.toString();
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Mocks (gateway 経由の Prisma と Stripe は本物、副作用系のみ差し替え)
// ---------------------------------------------------------------------------
// Stripe: 実 Stripe を叩かない。Refund child + Reservation.paymentStatus 更新のみを
// 検証するので、fake refund object を返す (refund-command test と同型)。
const mockRefundsCreate = mock<
  (
    args: Record<string, unknown>,
    opts?: { idempotencyKey?: string },
  ) => Promise<{ id: string; status: string }>
>((_args, _opts) =>
  Promise.resolve({
    id: `re_test_${crypto.randomUUID()}`,
    status: "succeeded",
  }),
);
mock.module("@/shared/lib/stripe", () => ({
  getStripeClient: () =>
    Promise.resolve({
      client: {
        refunds: { create: mockRefundsCreate },
      },
    }),
}));

// Settings row 依存を回避 (Stripe credentials は fake)。
mock.module("@/shared/domain/payment/availability", () => ({
  assertOnlinePaymentAvailable: () =>
    Promise.resolve({
      stripeSecretKey: "sk_test_dummy",
      stripeWebhookSecret: "whsec_dummy",
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeCurrency: "jpy",
      stripePaymentMethodTypes: ["card"],
    }),
}));

// AuditLog: hash chain state を汚染しないよう mock。metadata を record して assert。
const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve());
mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (input: Record<string, unknown>) =>
    mockCreateAuditLogRecord(input),
}));

// Notification: DB 書込を回避 (Notification 側 chain が別途あるため)。
const mockCreateNotification = mock<
  (input: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve());
mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: (input: Record<string, unknown>) =>
    mockCreateNotification(input),
}));

// GCal 削除は外部 API を叩くため mock。
const mockDeleteCalendarSync = mock<
  (reservationId: string, eventId: string) => Promise<void>
>(() => Promise.resolve());
mock.module("@/shared/lib/calendar-sync/outbound", () => ({
  deleteCalendarSync: (rId: string, eId: string) =>
    mockDeleteCalendarSync(rId, eId),
}));

// メール送信 (顧客 + 管理者) は外部 SMTP を叩くため mock。
const mockSendCancelled = mock<
  (data: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve({ ok: true }));
const mockSendAdminNotification = mock<
  (data: Record<string, unknown>, action: string) => Promise<unknown>
>(() => Promise.resolve({ ok: true }));
mock.module("@/shared/lib/email/reservation-emails", () => ({
  sendReservationCancelledEmail: (d: Record<string, unknown>) =>
    mockSendCancelled(d),
  sendReservationAdminNotification: (
    d: Record<string, unknown>,
    action: string,
  ) => mockSendAdminNotification(d, action),
}));

// SwitchBot revoke: 外部 API を叩くため mock。
mock.module("@/shared/domain/smart-lock/revoke-passcode", () => ({
  revokeSmartLockPasscodesForReservation: () => Promise.resolve(),
}));

// logError: refundRate=0% skip 分岐で発火するのを record。
const mockLogError = mock<(err: Error, ctx: Record<string, unknown>) => void>(
  () => {},
);
const errorLevels = {
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
};
mock.module("@/shared/lib/errors/server", () => ({
  logError: (err: Error, ctx: Record<string, unknown>) =>
    mockLogError(err, ctx),
  normalizeError: (err: unknown) =>
    err instanceof Error ? err : new Error(String(err)),
  ...errorLevels,
}));

// fireAndForget: applyCancellationSideEffects は refund を detach するため、テスト側で
// 発火 Promise を集めて applyCancellationSideEffects 完了後に await する。
// 差し替えは (promise, opts) → 中で `.catch()` して push する形にし、
// 元の意味論 (エラー握り潰し) を保つ。
const pendingSideEffects: Promise<unknown>[] = [];
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (p: Promise<unknown>, _opts: unknown) => {
    pendingSideEffects.push(
      p.catch((err) => {
        mockLogError(err instanceof Error ? err : new Error(String(err)), {
          operation: "test-fireAndForget-catch",
        });
      }),
    );
  },
}));

// ---------------------------------------------------------------------------
// Dynamic imports (mock 登録後に gateway を読む)
// ---------------------------------------------------------------------------
type PrismaModule = typeof import("@/shared/db/prisma");
type SideEffectsModule =
  typeof import("@/shared/domain/reservations/cancellation-side-effects");
type PrismaEnumsModule = typeof import("@generated/prisma/enums");
type HelpersModule = typeof import("@/shared/lib/validations/enums/helpers");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let applyCancellationSideEffects: SideEffectsModule["applyCancellationSideEffects"];
let PaymentStatus: PrismaEnumsModule["PaymentStatus"];
let REFUNDED_BY_TYPE: HelpersModule["REFUNDED_BY_TYPE"];

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
type ReservationFixture = {
  reservationId: string;
  spaceId: string;
  customerId: string;
  locationId: string;
  cleanup: () => Promise<void>;
};

// Date.now() は per-test で読み直せないため module-load 時に seed を採る (INT 範囲を
// 秒単位で正規化)。fixture ごとに ++ して sortOrder unique を担保。
let nextFixtureSortOrder = Math.floor(Date.now() / 1000);

async function createPaidReservationFixture(
  totalPriceWithTax: number,
  hoursUntilStart: number,
): Promise<ReservationFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `refundpol-loc-${suffix}`,
      name: `RefundPolicy Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `refundpol-space-${suffix}`,
      name: `RefundPolicy Space ${suffix}`,
      descriptionJson: { type: "doc" },
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
    },
    select: { id: true },
  });

  const customer = await prisma.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: `refundpol-${suffix}@example.com`,
      emailCanonical: `refundpol-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const now = Date.now();
  const startTime = new Date(now + hoursUntilStart * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

  const taxAmount = Math.floor((totalPriceWithTax * 10) / 110);
  const basePrice = totalPriceWithTax - taxAmount;

  const reservation = await prisma.reservation.create({
    data: {
      customerId: customer.id,
      spaceId: space.id,
      startTime,
      endTime,
      status: "CANCELLED",
      totalPrice: totalPriceWithTax,
      basePrice,
      rateBreakdownJson: { legacy: true, segments: [] },
      taxRateType: "standard",
      taxRate: 10,
      taxAmount,
      totalPriceWithTax,
      paymentStatus: "PAID",
      stripePaymentIntentId: `pi_test_${suffix}`,
    },
    select: { id: true },
  });

  return {
    reservationId: reservation.id,
    spaceId: space.id,
    customerId: customer.id,
    locationId: location.id,
    cleanup: async () => {
      await prisma.refund.deleteMany({
        where: { reservationId: reservation.id },
      });
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

async function setRefundPolicy(policy: unknown): Promise<void> {
  // Settings singleton は毎テスト upsert。JsonNull は Prisma に null を渡すと
  // undefined と衝突するため raw で対応 (updateMany data は Prisma sentinel を使う)。
  await prisma.settings.upsert({
    where: { id: "singleton" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only: shape 破損 case で unknown JSON も渡すため
    create: { id: "singleton", refundPolicy: policy as any },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    update: { refundPolicy: policy as any },
  });
}

async function clearRefundPolicy(): Promise<void> {
  await prisma.$executeRaw`UPDATE settings SET "refundPolicy" = NULL WHERE id = 'singleton'`;
}

function baseInput(reservationId: string) {
  return {
    reservationId,
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

async function drainSideEffects(): Promise<void> {
  // applyCancellationSideEffects 完了後、fireAndForget で集めた Promise を全 await。
  // refund tx / audit log 書込を確定させてから assertion に入る。
  const pending = pendingSideEffects.splice(0);
  await Promise.all(pending);
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describeMaybe(
  "applyCancellationSideEffects × refundPolicy (integration)",
  () => {
    beforeAll(async () => {
      ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
      ({ applyCancellationSideEffects } =
        await import("@/shared/domain/reservations/cancellation-side-effects"));
      ({ PaymentStatus } = await import("@generated/prisma/enums"));
      ({ REFUNDED_BY_TYPE } =
        await import("@/shared/lib/validations/enums/helpers"));

      await prisma.$queryRaw`SELECT 1`;

      // 残留 fixture を掃除 (再実行耐性)。
      await prisma.refund.deleteMany({
        where: {
          reservation: {
            space: {
              location: { slug: { startsWith: "refundpol-loc-" } },
            },
          },
        },
      });
      await prisma.reservation.deleteMany({
        where: {
          space: { location: { slug: { startsWith: "refundpol-loc-" } } },
        },
      });
      await prisma.space.deleteMany({
        where: { location: { slug: { startsWith: "refundpol-loc-" } } },
      });
      await prisma.customer.deleteMany({
        where: { email: { startsWith: "refundpol-" } },
      });
      await prisma.location.deleteMany({
        where: { slug: { startsWith: "refundpol-loc-" } },
      });
    });

    afterAll(async () => {
      await clearRefundPolicy();
      await basePrisma.$disconnect();
    });

    beforeEach(async () => {
      mockRefundsCreate.mockReset();
      mockCreateAuditLogRecord.mockReset();
      mockCreateNotification.mockReset();
      mockDeleteCalendarSync.mockReset();
      mockSendCancelled.mockReset();
      mockSendAdminNotification.mockReset();
      mockLogError.mockReset();
      pendingSideEffects.length = 0;

      // 各 test 前に refund id を unique にする factory を再インストール
      // (mockReset で消える)。
      mockRefundsCreate.mockImplementation(() =>
        Promise.resolve({
          id: `re_test_${crypto.randomUUID()}`,
          status: "succeeded",
        }),
      );
      mockCreateAuditLogRecord.mockImplementation(() => Promise.resolve());
      mockCreateNotification.mockImplementation(() => Promise.resolve());
      mockDeleteCalendarSync.mockImplementation(() => Promise.resolve());
      mockSendCancelled.mockImplementation(() => Promise.resolve({ ok: true }));
      mockSendAdminNotification.mockImplementation(() =>
        Promise.resolve({ ok: true }),
      );

      await clearRefundPolicy();
    });

    test("case 1: policy 未設定 (Settings.refundPolicy = null) → 残額全額返金 (後方互換)", async () => {
      const { reservationId, cleanup } = await createPaidReservationFixture(
        5000,
        200, // 200h 後 (関係ないが >0 で ok)
      );
      try {
        await clearRefundPolicy();
        await applyCancellationSideEffects(baseInput(reservationId));
        await drainSideEffects();

        const refunds = await prisma.refund.findMany({
          where: { reservationId },
        });
        expect(refunds).toHaveLength(1);
        const refund = refunds[0]!;
        expect(refund.amount).toBe(5000);
        expect(refund.refundedByType).toBe(REFUNDED_BY_TYPE.AUTO_ON_CANCEL);
        expect(refund.reservationId).toBe(reservationId);

        const reservation = await prisma.reservation.findUnique({
          where: { id: reservationId },
          select: { paymentStatus: true },
        });
        expect(reservation?.paymentStatus).toBe(PaymentStatus.REFUNDED);
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("case 2: policy (168h=100%) + 200h 前予約 → 全額返金", async () => {
      const { reservationId, cleanup } = await createPaidReservationFixture(
        5000,
        200,
      );
      try {
        await setRefundPolicy({
          tiers: [{ hoursBefore: 168, refundRate: 100 }],
          defaultRefundRate: 0,
        });
        await applyCancellationSideEffects(baseInput(reservationId));
        await drainSideEffects();

        const refunds = await prisma.refund.findMany({
          where: { reservationId },
        });
        expect(refunds).toHaveLength(1);
        expect(refunds[0]!.amount).toBe(5000);
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("case 3: policy (168h=100% / 72h=50%) + 100h 前予約 → 半額返金", async () => {
      const { reservationId, cleanup } = await createPaidReservationFixture(
        5000,
        100,
      );
      try {
        await setRefundPolicy({
          tiers: [
            { hoursBefore: 168, refundRate: 100 },
            { hoursBefore: 72, refundRate: 50 },
          ],
          defaultRefundRate: 0,
        });
        await applyCancellationSideEffects(baseInput(reservationId));
        await drainSideEffects();

        const refunds = await prisma.refund.findMany({
          where: { reservationId },
        });
        expect(refunds).toHaveLength(1);
        // 168h tier 外れ (100h < 168h) → 72h tier match → 50% = 2500
        expect(refunds[0]!.amount).toBe(2500);
        expect(refunds[0]!.refundedByType).toBe(
          REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
        );

        const reservation = await prisma.reservation.findUnique({
          where: { id: reservationId },
          select: { paymentStatus: true },
        });
        // 部分返金なので PARTIALLY_REFUNDED
        expect(reservation?.paymentStatus).toBe(
          PaymentStatus.PARTIALLY_REFUNDED,
        );
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("case 4: policy (defaultRate=0%) + 24h 前予約 → refund skip + logError 発火 (キャンセル自体は続行)", async () => {
      const { reservationId, cleanup } = await createPaidReservationFixture(
        5000,
        24,
      );
      try {
        await setRefundPolicy({
          tiers: [
            { hoursBefore: 168, refundRate: 100 },
            { hoursBefore: 72, refundRate: 50 },
          ],
          defaultRefundRate: 0,
        });
        await applyCancellationSideEffects(baseInput(reservationId));
        await drainSideEffects();

        // Refund child は 0 レコード (skip)
        const refunds = await prisma.refund.findMany({
          where: { reservationId },
        });
        expect(refunds).toHaveLength(0);

        // Stripe API も呼ばれない
        expect(mockRefundsCreate).not.toHaveBeenCalled();

        // Reservation.paymentStatus は PAID のまま (refund されていない)
        const reservation = await prisma.reservation.findUnique({
          where: { id: reservationId },
          select: { paymentStatus: true },
        });
        expect(reservation?.paymentStatus).toBe(PaymentStatus.PAID);

        // logError が「refund rate 0%」の理由で発火
        const zeroRateLogs = mockLogError.mock.calls.filter((call) => {
          const ctx = call[1] as {
            context?: { reason?: unknown } | undefined;
          };
          return ctx.context?.reason === "policyRefundRateZero";
        });
        expect(zeroRateLogs).toHaveLength(1);

        // AuditLog は cancellation の 1 件のみ (refund skip なので refund audit なし)
        const cancellationAudits = mockCreateAuditLogRecord.mock.calls.filter(
          (call) => {
            const input = call[0] as { metadata?: { wasPaid?: unknown } };
            return input.metadata?.wasPaid !== undefined;
          },
        );
        expect(cancellationAudits).toHaveLength(1);
        const auditInput = cancellationAudits[0]![0] as {
          metadata: { wasPaid: boolean; requiresRefund: boolean };
        };
        expect(auditInput.metadata.wasPaid).toBe(true);
        expect(auditInput.metadata.requiresRefund).toBe(true);
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("case 5: policy shape 破損 (tiers 欠落) → parseRefundPolicy が null に fallback → 全額返金", async () => {
      const { reservationId, cleanup } = await createPaidReservationFixture(
        5000,
        100,
      );
      try {
        // shape 違反 (tiers array ではなく string)。parseRefundPolicy は null 返却。
        await setRefundPolicy({ tiers: "broken", defaultRefundRate: 100 });
        await applyCancellationSideEffects(baseInput(reservationId));
        await drainSideEffects();

        const refunds = await prisma.refund.findMany({
          where: { reservationId },
        });
        expect(refunds).toHaveLength(1);
        // policy 破損 → null fallback → amount undefined pass through → 残額全額
        expect(refunds[0]!.amount).toBe(5000);
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("case 6: policy (72h=50%) 適用時 Refund child の refundedByType + reservationId 記録", async () => {
      const { reservationId, cleanup } = await createPaidReservationFixture(
        8000,
        80,
      );
      try {
        await setRefundPolicy({
          tiers: [{ hoursBefore: 72, refundRate: 50 }],
          defaultRefundRate: 0,
        });
        await applyCancellationSideEffects(baseInput(reservationId));
        await drainSideEffects();

        const refunds = await prisma.refund.findMany({
          where: { reservationId },
        });
        expect(refunds).toHaveLength(1);
        const refund = refunds[0]!;
        expect(refund.amount).toBe(4000);
        expect(refund.refundedByType).toBe(REFUNDED_BY_TYPE.AUTO_ON_CANCEL);
        expect(refund.reservationId).toBe(reservationId);
        // polymorphic 側の event registration ID は null (Reservation 経路)
        expect(refund.eventRegistrationId).toBeNull();
      } finally {
        await cleanup();
      }
    }, 30_000);

    test("case 7: policy 全額返金経路で AuditLog metadata (wasPaid / requiresRefund) 記録", async () => {
      const { reservationId, cleanup } = await createPaidReservationFixture(
        3000,
        200,
      );
      try {
        await setRefundPolicy({
          tiers: [{ hoursBefore: 168, refundRate: 100 }],
          defaultRefundRate: 0,
        });
        await applyCancellationSideEffects(baseInput(reservationId));
        await drainSideEffects();

        // AuditLog: cancellation の audit と refund command の audit が同一 resource
        // ("reservation") で 2 回書かれるため、metadata の shape で cancellation 側を
        // 特定して verify する。
        const cancellationAudits = mockCreateAuditLogRecord.mock.calls.filter(
          (call) => {
            const input = call[0] as { metadata?: { wasPaid?: unknown } };
            return input.metadata?.wasPaid !== undefined;
          },
        );
        expect(cancellationAudits).toHaveLength(1);
        const auditInput = cancellationAudits[0]![0] as {
          metadata: {
            wasPaid: boolean;
            requiresRefund: boolean;
            channel: string;
          };
          resource: string;
          resourceId: string;
        };
        expect(auditInput.resource).toBe("reservation");
        expect(auditInput.resourceId).toBe(reservationId);
        expect(auditInput.metadata.wasPaid).toBe(true);
        expect(auditInput.metadata.requiresRefund).toBe(true);
        expect(auditInput.metadata.channel).toBe("customer-mypage");
      } finally {
        await cleanup();
      }
    }, 30_000);
  },
);
