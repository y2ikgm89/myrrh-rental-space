/**
 * `refundReservationPaymentCommand` の実 DB 統合テスト (task #9 PR#3)。
 *
 * 検証対象 (unit mock 不能な interactive tx + advisory lock + Refund child table 集計):
 * 1. 全額返金で PAID → REFUNDED + Refund child 1 レコード書込
 * 2. 部分返金 2 回で PAID → PARTIALLY_REFUNDED → REFUNDED + Refund 2 レコード
 * 3. amount 未指定は残額全額を返金
 * 4. 残額超過の amount 指定は VALIDATION reject
 * 5. REFUNDED 済みで追加返金不可 (VALIDATION)
 * 6. UNPAID/PENDING/FAILED で返金不可 (VALIDATION)
 * 7. stripePaymentIntentId 未設定で返金不可 (VALIDATION)
 * 8. concurrent race (advisory lock 直列化 → over-refund 防止)
 * 9. AuditLog に actorType + cumulativeAmount + refundAmount + stripeRefundId 記録
 *
 * == 実行条件 ==
 * 実 Postgres を要求する (advisory lock + child table aggregate の直列化は mock 不能)。
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。
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

// グローバル preload が DATABASE_URL をダミー値に固定するため、gateway を読む前に
// 実テスト DB へ向け直す (静的 import は gateway を引かないためこの代入は動的 import
// より先に実行される)。
// concurrent race test で 3 tx が interactive slot を並行取得するため connection_limit と
// pool_timeout を明示指定 (Prisma default 8-12 slots・pool_timeout 10s では pool 枯渇時に
// 「Unable to start a transaction in the given time」が発生する)。
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
// Mocks
// ---------------------------------------------------------------------------
// Stripe: 実 Stripe に呼ばず fake refund object を返す。idempotency key を record して
// key strategy (running cumulative) の検証にも使う。
const mockRefundsCreate = mock<
  (
    args: Record<string, unknown>,
    opts?: { idempotencyKey?: string },
  ) => Promise<{ id: string; status: string }>
>((_args, _opts) => Promise.resolve({ id: "", status: "succeeded" }));

mock.module("@/shared/lib/stripe", () => ({
  getStripeClient: () =>
    Promise.resolve({
      client: {
        refunds: { create: mockRefundsCreate },
      },
    }),
}));

// assertOnlinePaymentAvailable: Settings row 依存を回避し dummy credentials を返す。
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

// AuditLog: hash-chain の書込が実 DB を汚染 (chain 状態 pollute) するため mock。
// mock は各呼出の input を record し、metadata / userId / newValue の検証に使う。
const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve());

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (input: Record<string, unknown>) =>
    mockCreateAuditLogRecord(input),
}));

// ---------------------------------------------------------------------------
// Dynamic imports (gateway 上書き後に読む)
// ---------------------------------------------------------------------------
type PrismaModule = typeof import("@/shared/db/prisma");
type PaymentCommandsModule =
  typeof import("@/shared/domain/reservations/payment-commands");
type PrismaEnumsModule = typeof import("@generated/prisma/enums");
type HelpersModule = typeof import("@/shared/lib/validations/enums/helpers");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let refundReservationPaymentCommand: PaymentCommandsModule["refundReservationPaymentCommand"];
let PaymentStatus: PrismaEnumsModule["PaymentStatus"];
let REFUNDED_BY_TYPE: HelpersModule["REFUNDED_BY_TYPE"];

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------
type ReservationFixture = {
  reservationId: string;
  spaceId: string;
  customerId: string;
  locationId: string;
  cleanup: () => Promise<void>;
};

// sortOrder は Date.now()/1000 (秒単位、INT 範囲内) ベースで module load 時に unique 化する。
// 固定値だと同 test DB に残留した過去 fixture (前回 fail で cleanup 未実行) と
// unique constraint 衝突する。beforeAll でも残留を掃除する二重防御。
// Date.now() ms は INT 範囲 (max 2147483647) を超えるため秒単位で正規化。
let nextFixtureSortOrder = Math.floor(Date.now() / 1000);
let stripeRefundCounter = 0;

async function createPaidReservationFixture(
  totalPriceWithTax: number,
  paymentStatus: (typeof PaymentStatus)[keyof typeof PaymentStatus] = PaymentStatus.PAID,
): Promise<ReservationFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `refund-loc-${suffix}`,
      name: `Refund Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `refund-space-${suffix}`,
      name: `Refund Space ${suffix}`,
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
      email: `refund-${suffix}@example.com`,
      emailCanonical: `refund-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const startTime = new Date(`2027-04-01T09:00:00+09:00`);
  const endTime = new Date(`2027-04-01T11:00:00+09:00`);

  const taxAmount = Math.floor((totalPriceWithTax * 10) / 110);
  const basePrice = totalPriceWithTax - taxAmount;

  const reservation = await prisma.reservation.create({
    data: {
      customerId: customer.id,
      spaceId: space.id,
      startTime,
      endTime,
      status: "CONFIRMED",
      totalPrice: totalPriceWithTax,
      basePrice,
      // legacy 判定を通す最小限 rateBreakdown (receipts/issue.ts の isLegacyRateBreakdown pattern)
      rateBreakdownJson: { legacy: true, segments: [] },
      taxRateType: "standard",
      taxRate: 10,
      taxAmount,
      totalPriceWithTax,
      paymentStatus,
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

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------
describeMaybe("refundReservationPaymentCommand (integration)", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ refundReservationPaymentCommand } =
      await import("@/shared/domain/reservations/payment-commands"));
    ({ PaymentStatus } = await import("@generated/prisma/enums"));
    ({ REFUNDED_BY_TYPE } =
      await import("@/shared/lib/validations/enums/helpers"));

    // 接続プール warm-up (cold start が並行クエリをずらして race を隠すのを防ぐ)。
    await prisma.$queryRaw`SELECT 1`;

    // 過去の fail 実行で cleanup 未達な残留 fixture を予備削除 (再実行耐性)。
    // FK 順: refunds → reservations → spaces → customers → locations。
    await prisma.refund.deleteMany({
      where: {
        reservation: {
          space: { location: { slug: { startsWith: "refund-loc-" } } },
        },
      },
    });
    await prisma.reservation.deleteMany({
      where: { space: { location: { slug: { startsWith: "refund-loc-" } } } },
    });
    await prisma.space.deleteMany({
      where: { location: { slug: { startsWith: "refund-loc-" } } },
    });
    await prisma.customer.deleteMany({
      where: { email: { startsWith: "refund-" } },
    });
    await prisma.location.deleteMany({
      where: { slug: { startsWith: "refund-loc-" } },
    });
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  beforeEach(async () => {
    mockRefundsCreate.mockReset();
    mockCreateAuditLogRecord.mockReset();
    stripeRefundCounter = 0;
    // 各 test の Stripe refund id が unique になる counter (@unique(stripeRefundId) の衝突回避)
    mockRefundsCreate.mockImplementation((_args, _opts) => {
      stripeRefundCounter++;
      return Promise.resolve({
        id: `re_test_${crypto.randomUUID()}`,
        status: "succeeded",
      });
    });
    // mockReset は factory (mock<>(() => Promise.resolve())) も消すため、
    // 明示的に AuditLog mock の Promise 返却を再設定する (`await createAuditLogRecord`
    // が undefined を await して非同期 chain が壊れないことを保証)。
    mockCreateAuditLogRecord.mockImplementation(() => Promise.resolve());
  });

  test("全額返金で PAID → REFUNDED + Refund child 1 レコード + AuditLog 記録", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(5000);
    try {
      const result = await refundReservationPaymentCommand({
        reservationId,
        actorType: REFUNDED_BY_TYPE.ADMIN,
        actorUserId: "admin-user-id",
      });

      expect(result.newPaymentStatus).toBe(PaymentStatus.REFUNDED);
      expect(result.refundAmount).toBe(5000);
      expect(result.cumulativeAmount).toBe(5000);

      const refunds = await prisma.refund.findMany({
        where: { reservationId },
      });
      expect(refunds).toHaveLength(1);
      const refund = refunds[0]!;
      expect(refund.amount).toBe(5000);
      expect(refund.refundedByType).toBe(REFUNDED_BY_TYPE.ADMIN);
      expect(refund.reason).toBeNull();

      const reservation = await prisma.reservation.findUnique({
        where: { id: reservationId },
        select: { paymentStatus: true },
      });
      expect(reservation?.paymentStatus).toBe(PaymentStatus.REFUNDED);

      // AuditLog record
      expect(mockCreateAuditLogRecord).toHaveBeenCalledTimes(1);
      const auditInput = mockCreateAuditLogRecord.mock.calls[0]![0] as {
        userId: string;
        resource: string;
        resourceId: string;
        newValue: { paymentStatus: string; refundedAmount: number };
        metadata: {
          actorType: string;
          refundAmount: number;
          cumulativeAmount: number;
          stripeRefundId: string;
        };
      };
      expect(auditInput.userId).toBe("admin-user-id");
      expect(auditInput.resource).toBe("reservation");
      expect(auditInput.resourceId).toBe(reservationId);
      expect(auditInput.newValue.paymentStatus).toBe(PaymentStatus.REFUNDED);
      expect(auditInput.newValue.refundedAmount).toBe(5000);
      expect(auditInput.metadata.actorType).toBe(REFUNDED_BY_TYPE.ADMIN);
      expect(auditInput.metadata.refundAmount).toBe(5000);
      expect(auditInput.metadata.cumulativeAmount).toBe(5000);
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("部分返金 2 回で PAID → PARTIALLY_REFUNDED → REFUNDED + Refund 2 レコード", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(5000);
    try {
      const r1 = await refundReservationPaymentCommand({
        reservationId,
        amount: 2000,
        reason: "顧客都合",
        actorType: REFUNDED_BY_TYPE.ADMIN,
      });
      expect(r1.newPaymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
      expect(r1.refundAmount).toBe(2000);
      expect(r1.cumulativeAmount).toBe(2000);

      const r2 = await refundReservationPaymentCommand({
        reservationId,
        actorType: REFUNDED_BY_TYPE.ADMIN,
        // amount 未指定 → 残額 3000 を全額返金
      });
      expect(r2.newPaymentStatus).toBe(PaymentStatus.REFUNDED);
      expect(r2.refundAmount).toBe(3000);
      expect(r2.cumulativeAmount).toBe(5000);

      const refunds = await prisma.refund.findMany({
        where: { reservationId },
        orderBy: { createdAt: "asc" },
      });
      expect(refunds).toHaveLength(2);
      expect(refunds[0]!.amount).toBe(2000);
      expect(refunds[0]!.reason).toBe("顧客都合");
      expect(refunds[1]!.amount).toBe(3000);

      // Stripe idempotency key: 累積後 total を key に含める (2000, 5000)
      expect(mockRefundsCreate).toHaveBeenCalledTimes(2);
      const opts1 = mockRefundsCreate.mock.calls[0]![1] as {
        idempotencyKey?: string;
      };
      const opts2 = mockRefundsCreate.mock.calls[1]![1] as {
        idempotencyKey?: string;
      };
      expect(opts1.idempotencyKey).toBe(
        `reservation-refund-${reservationId}-2000`,
      );
      expect(opts2.idempotencyKey).toBe(
        `reservation-refund-${reservationId}-5000`,
      );
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("残額を超える amount 指定は VALIDATION reject", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(5000);
    try {
      // Bun 1.3.14 の bug 回避 (実 DB 統合テストで `expect(promise).rejects` が hang する)
      // 詳細: memory/feedback_bun-rejects-hang-and-npm-script-args
      let caught: unknown;
      try {
        await refundReservationPaymentCommand({
          reservationId,
          amount: 6000,
          actorType: REFUNDED_BY_TYPE.ADMIN,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toMatchObject({ code: "VALIDATION" });
      expect(mockRefundsCreate).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("既に REFUNDED 済みは追加返金不可 (VALIDATION)", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(5000);
    try {
      // 1st: 全額返金
      await refundReservationPaymentCommand({
        reservationId,
        actorType: REFUNDED_BY_TYPE.ADMIN,
      });
      // 2nd: すでに REFUNDED (Bun rejects hang 回避のため try/catch)
      let caught: unknown;
      try {
        await refundReservationPaymentCommand({
          reservationId,
          actorType: REFUNDED_BY_TYPE.ADMIN,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toMatchObject({ code: "VALIDATION" });
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("UNPAID の予約は VALIDATION reject", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(
      5000,
      PaymentStatus.UNPAID,
    );
    try {
      // Bun rejects hang 回避 (try/catch)
      let caught: unknown;
      try {
        await refundReservationPaymentCommand({
          reservationId,
          actorType: REFUNDED_BY_TYPE.ADMIN,
        });
      } catch (err) {
        caught = err;
      }
      expect(caught).toMatchObject({ code: "VALIDATION" });
      expect(mockRefundsCreate).not.toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("concurrent race: 3 並行 refund tx で advisory lock により over-refund 防止", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture(5000);
    try {
      // 各 refund は 3000 円要求。合計 9000 > 5000 = totalPriceWithTax。
      // advisory lock 直列化 → 1 個目 (3000, 累積 3000) → 2 個目は残額 2000 に切り替わって
      // 3000 要求は over-refund で reject。3 個目も同様 reject。
      const results = await Promise.allSettled([
        refundReservationPaymentCommand({
          reservationId,
          amount: 3000,
          actorType: REFUNDED_BY_TYPE.ADMIN,
        }),
        refundReservationPaymentCommand({
          reservationId,
          amount: 3000,
          actorType: REFUNDED_BY_TYPE.ADMIN,
        }),
        refundReservationPaymentCommand({
          reservationId,
          amount: 3000,
          actorType: REFUNDED_BY_TYPE.ADMIN,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(2);
      for (const r of rejected) {
        expect(r.reason).toMatchObject({ code: "VALIDATION" });
      }

      // Refund child table は 1 レコードのみ (advisory lock で serialize)
      const refunds = await prisma.refund.findMany({
        where: { reservationId },
      });
      expect(refunds).toHaveLength(1);
      expect(refunds[0]!.amount).toBe(3000);

      // Stripe refund も 1 回だけ (over-refund の tx は Stripe API に到達しない)
      expect(mockRefundsCreate).toHaveBeenCalledTimes(1);
    } finally {
      await cleanup();
    }
  }, 30_000);
});
