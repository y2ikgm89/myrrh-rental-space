/**
 * 予約の**自動**返金コマンドが、実 DB に正しい Refund 行を書くことの検証。
 *
 * == なぜ要るのか ==
 *
 * `refundCheckoutAmountMismatchForReservation` と
 * `refundOrphanedStripePaymentForCancelledReservation` は webhook から発火する。
 * 人は介在せず、失敗しても誰も気付かない。にもかかわらず、この 2 本を名指しする
 * テストは `__tests__/unit/api/stripe-webhook*.test.ts` だけで、そこは
 * `mock.module("@/shared/domain/reservations/payment-commands", …)` で
 * **コマンドごと差し替えている**。固定されているのは「webhook がこの関数を呼ぶ」
 * という配線だけで、**本体は一度も走っていない**。
 *
 * 本体が持つ不変条件は実 DB でしか確かめられない:
 *
 * - `createRefundRecordIdempotent` は `SAVEPOINT` → `refund.create` →
 *   `Refund.stripeRefundId` の unique 違反を握りつぶして `ROLLBACK TO SAVEPOINT`
 *   という形で冪等性を作る。unique index も savepoint も mock には無い。
 * - `isRefundSettledSuccess` による分岐（非同期返金が未確定の間は `paymentStatus`
 *   を書き換えない）は、書いた後の行を読まないと確かめられない。
 *
 * == 何を mock するか ==
 *
 * 外部境界だけ。Stripe SDK（実 API を叩かない）、Stripe 資格情報（Settings 行への
 * 依存を切る）、AuditLog（hash-chain が共有 test-db を汚染する）。
 * ドメインのコマンドと Prisma は本物を通す。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { deleteRefundsForTest } from "../../../helpers/refund-test-cleanup";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// ---------------------------------------------------------------------------
// 外部境界の mock
// ---------------------------------------------------------------------------

/** Stripe が返す refund object。テストごとに id / status を差し替える。 */
let nextStripeRefund: { id: string; status: string } = {
  id: "re_placeholder",
  status: "succeeded",
};

const mockRefundsCreate = mock<() => Promise<{ id: string; status: string }>>(
  () => Promise.resolve(nextStripeRefund),
);

mock.module("@/shared/lib/stripe", () => ({
  getStripeClient: () => ({
    client: { refunds: { create: mockRefundsCreate } },
  }),
}));

const STRIPE_SETTINGS = {
  stripeSecretKey: "sk_test_dummy",
  stripeWebhookSecret: "whsec_dummy",
  stripePublishableKey: null,
  stripeAccountId: null,
  stripeCurrency: "jpy",
  stripePaymentMethodTypes: ["card"],
};

const actualAvailability = await import("@/shared/domain/payment/availability");
// `mock.module` は完全置換。実モジュールを spread する（`.claude/rules/testing.md`）。
mock.module("@/shared/domain/payment/availability", () => ({
  ...actualAvailability,
  assertOnlinePaymentAvailable: () => Promise.resolve(STRIPE_SETTINGS),
  assertStripeCredentialsConfigured: () => Promise.resolve(STRIPE_SETTINGS),
}));

// AuditLog は hash-chain を実 DB に積むので共有 test-db を汚染する。
mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: () => Promise.resolve(),
}));

// ---------------------------------------------------------------------------
// 動的 import（gateway 上書き後に読む）
// ---------------------------------------------------------------------------
type PrismaModule = typeof import("@/shared/db/prisma");
type PaymentCommandsModule =
  typeof import("@/shared/domain/reservations/payment-commands");
type EnumsModule = typeof import("@generated/prisma/enums");

let prisma: PrismaModule["prisma"];
let refundCheckoutAmountMismatchForReservation: PaymentCommandsModule["refundCheckoutAmountMismatchForReservation"];
let refundOrphanedStripePaymentForCancelledReservation: PaymentCommandsModule["refundOrphanedStripePaymentForCancelledReservation"];
let PaymentStatus: EnumsModule["PaymentStatus"];
let ReservationStatus: EnumsModule["ReservationStatus"];

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------
/** 予約の税率。fixture はアプリと同じ向き（税抜 → round）で税額を導く。 */
const TAX_RATE_PERCENT = 10;
/** 税抜からの導出で再現できる税込額（`reservations_tax_amount_derivation_check`）。 */
const TOTAL_WITH_TAX = 11000;

let nextFixtureSortOrder = Math.floor(Date.now() / 1000);

type Cleanup = () => Promise<void>;

type ReservationFixture = {
  reservationId: string;
  cleanup: Cleanup;
};

async function createReservationFixture(opts: {
  readonly status: (typeof ReservationStatus)[keyof typeof ReservationStatus];
  readonly paymentStatus: (typeof PaymentStatus)[keyof typeof PaymentStatus];
  readonly stripePaymentIntentId: string | null;
}): Promise<ReservationFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `auto-refund-loc-${suffix}`,
      name: `Auto Refund Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureSortOrder++,
    },
    select: { id: true },
  });
  const space = await prisma.space.create({
    data: {
      slug: `auto-refund-space-${suffix}`,
      name: `Auto Refund Space ${suffix}`,
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
      email: `auto-refund-${suffix}@example.com`,
      emailCanonical: `auto-refund-${suffix}@example.com`,
    },
    select: { id: true },
  });

  // 税額はアプリの書込経路と同じ向きで導く（税抜から round）。逆向きに作ると
  // `reservations_tax_amount_derivation_check` を満たさない、
  // **アプリが決して作れないデータ**になる。
  const basePrice = Math.round(
    (TOTAL_WITH_TAX * 100) / (100 + TAX_RATE_PERCENT),
  );
  const taxAmount = Math.round((basePrice * TAX_RATE_PERCENT) / 100);

  const reservation = await prisma.reservation.create({
    data: {
      customerId: customer.id,
      spaceId: space.id,
      startTime: new Date("2027-04-01T09:00:00+09:00"),
      endTime: new Date("2027-04-01T11:00:00+09:00"),
      status: opts.status,
      paymentStatus: opts.paymentStatus,
      stripePaymentIntentId: opts.stripePaymentIntentId,
      totalPrice: basePrice,
      basePrice,
      taxRateType: "STANDARD",
      taxRate: TAX_RATE_PERCENT,
      taxAmount,
      totalPriceWithTax: TOTAL_WITH_TAX,
      rateBreakdownJson: {
        schemaVersion: 1,
        segments: [],
        totalHours: 0,
        totalBasePrice: 0,
        holidayFlags: {},
      },
    },
    select: { id: true },
  });

  return {
    reservationId: reservation.id,
    cleanup: async () => {
      await deleteRefundsForTest(prisma, { reservationId: reservation.id });
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

async function refundRowsOf(reservationId: string) {
  return prisma.refund.findMany({
    where: { reservationId },
    select: { amount: true, stripeRefundId: true, refundedByType: true },
    orderBy: { createdAt: "asc" },
  });
}

async function paymentStatusOf(reservationId: string): Promise<string> {
  const row = await prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: { paymentStatus: true },
  });
  return row.paymentStatus;
}

describeMaybe("自動返金コマンドは実 DB に Refund 行を書く", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({
      refundCheckoutAmountMismatchForReservation,
      refundOrphanedStripePaymentForCancelledReservation,
    } = await import("@/shared/domain/reservations/payment-commands"));
    ({ PaymentStatus, ReservationStatus } =
      await import("@generated/prisma/enums"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // -------------------------------------------------------------------------
  // 金額不一致の自動返金
  // -------------------------------------------------------------------------

  test("金額不一致: Refund 行を 1 件書き、paymentStatus を REFUNDED にする", async () => {
    const paymentIntentId = `pi_mismatch_${crypto.randomUUID()}`;
    nextStripeRefund = {
      id: `re_mismatch_${crypto.randomUUID()}`,
      status: "succeeded",
    };
    const { reservationId, cleanup } = await createReservationFixture({
      status: ReservationStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      stripePaymentIntentId: paymentIntentId,
    });

    try {
      const result = await refundCheckoutAmountMismatchForReservation({
        reservationId,
        stripePaymentIntentId: paymentIntentId,
        capturedAppAmount: TOTAL_WITH_TAX,
      });

      expect(result.outcome).toBe("refunded");

      const rows = await refundRowsOf(reservationId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.amount).toBe(TOTAL_WITH_TAX);
      expect(rows[0]?.stripeRefundId).toBe(nextStripeRefund.id);
      expect(rows[0]?.refundedByType).toBe("AUTO_AMOUNT_MISMATCH");

      expect(await paymentStatusOf(reservationId)).toBe(PaymentStatus.REFUNDED);
    } finally {
      await cleanup();
    }
  });

  /**
   * 監査 A-27。Stripe が取った額が `totalPriceWithTax` を超えるとき、そのまま
   * `Refund.amount` に書くと DEFERRED な `refunds_total_within_paid_check` が
   * **COMMIT 時**に tx 全体を abort する（savepoint では捕まらない）。
   * Refund 行も監査ログも管理者通知も残らず、webhook が 500 を返して Stripe が
   * 最大 3 日間再送し続ける。上限を超える場合は Stripe を呼ばずに見送る。
   */
  test("金額不一致: 記録可能な上限を超える captured 額は返金せず見送る", async () => {
    const paymentIntentId = `pi_mismatch_over_${crypto.randomUUID()}`;
    nextStripeRefund = {
      id: `re_mismatch_over_${crypto.randomUUID()}`,
      status: "succeeded",
    };
    mockRefundsCreate.mockClear();

    const { reservationId, cleanup } = await createReservationFixture({
      status: ReservationStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      stripePaymentIntentId: paymentIntentId,
    });

    try {
      const result = await refundCheckoutAmountMismatchForReservation({
        reservationId,
        stripePaymentIntentId: paymentIntentId,
        // 予約は TOTAL_WITH_TAX だが Stripe は 2 倍取っている形
        capturedAppAmount: TOTAL_WITH_TAX * 2,
      });

      expect(result).toEqual({
        outcome: "amount_exceeds_recordable",
        recordableAmount: TOTAL_WITH_TAX,
      });

      // Stripe を呼んでいない（台帳に書けない返金を先に実行しない）
      expect(mockRefundsCreate).not.toHaveBeenCalled();
      // 制約違反の行も残っていない
      expect(await refundRowsOf(reservationId)).toHaveLength(0);
      // 決済状態も動かさない
      expect(await paymentStatusOf(reservationId)).toBe(PaymentStatus.PENDING);
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("金額不一致: 予約がまだ対象のまま stripeRefundId が衝突しても、savepoint で握りつぶして 1 件に収める", async () => {
    // **`already_refunded` の早期 return では savepoint 経路に到達しない。**
    // prepare トランザクションが `paymentStatus === REFUNDED` を見て抜けるため、
    // 単に 2 回呼ぶだけでは `createRefundRecordIdempotent` が走らない（Codex P2）。
    //
    // ここでは「予約はまだ返金対象のまま、同じ stripeRefundId の Refund だけが
    // 先に存在する」状態を作る。webhook が Stripe の refund を先に記録したあとで
    // このコマンドが走る競合に相当する。コマンドは最後まで進み、
    // `refund.create` が `Refund.stripeRefundId` の unique 違反で落ちて
    // `ROLLBACK TO SAVEPOINT` される — そこを通ることを見ている。
    const paymentIntentId = `pi_mismatch_dup_${crypto.randomUUID()}`;
    const collidingRefundId = `re_mismatch_dup_${crypto.randomUUID()}`;
    nextStripeRefund = { id: collidingRefundId, status: "succeeded" };

    const { reservationId, cleanup } = await createReservationFixture({
      status: ReservationStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      stripePaymentIntentId: paymentIntentId,
    });

    try {
      // 先客。金額はコマンドが書こうとする値とわざと変えて、
      // 「握りつぶした側が残る（上書きしない）」ことも見えるようにする。
      await prisma.refund.create({
        data: {
          reservationId,
          amount: TOTAL_WITH_TAX,
          stripeRefundId: collidingRefundId,
          refundedByType: "AUTO_AMOUNT_MISMATCH",
          status: "pending",
          reason: "先に webhook が記録した行",
        },
      });

      const result = await refundCheckoutAmountMismatchForReservation({
        reservationId,
        stripePaymentIntentId: paymentIntentId,
        capturedAppAmount: TOTAL_WITH_TAX,
      });

      // unique 違反を握りつぶしたあとも tx は生きていて、後続の
      // paymentStatus 更新まで到達する。
      expect(result.outcome).toBe("refunded");

      const rows = await refundRowsOf(reservationId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.stripeRefundId).toBe(collidingRefundId);

      expect(await paymentStatusOf(reservationId)).toBe(PaymentStatus.REFUNDED);
    } finally {
      await cleanup();
    }
  });

  test("金額不一致: 返金が未確定（pending）なら paymentStatus を動かさない", async () => {
    const paymentIntentId = `pi_mismatch_pending_${crypto.randomUUID()}`;
    nextStripeRefund = {
      id: `re_mismatch_pending_${crypto.randomUUID()}`,
      status: "pending",
    };
    const { reservationId, cleanup } = await createReservationFixture({
      status: ReservationStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      stripePaymentIntentId: paymentIntentId,
    });

    try {
      await refundCheckoutAmountMismatchForReservation({
        reservationId,
        stripePaymentIntentId: paymentIntentId,
        capturedAppAmount: TOTAL_WITH_TAX,
      });

      // Refund 行は残す（確定は refund.updated webhook が行う）。
      expect(await refundRowsOf(reservationId)).toHaveLength(1);
      // paymentStatus は据え置き。ここを動かすと未確定の返金を確定扱いにする。
      expect(await paymentStatusOf(reservationId)).toBe(PaymentStatus.PENDING);
    } finally {
      await cleanup();
    }
  });

  // -------------------------------------------------------------------------
  // キャンセル済みへの入金（orphan）の自動返金
  // -------------------------------------------------------------------------

  test("orphan: CANCELLED 予約への入金を全額返金し、Refund 行を書く", async () => {
    const paymentIntentId = `pi_orphan_${crypto.randomUUID()}`;
    nextStripeRefund = {
      id: `re_orphan_${crypto.randomUUID()}`,
      status: "succeeded",
    };
    const { reservationId, cleanup } = await createReservationFixture({
      status: ReservationStatus.CANCELLED,
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: paymentIntentId,
    });

    try {
      const result = await refundOrphanedStripePaymentForCancelledReservation({
        reservationId,
        stripePaymentIntentId: paymentIntentId,
      });

      expect(result.outcome).toBe("refunded");

      const rows = await refundRowsOf(reservationId);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.amount).toBe(TOTAL_WITH_TAX);
      expect(rows[0]?.refundedByType).toBe("AUTO_ON_CANCEL");

      expect(await paymentStatusOf(reservationId)).toBe(PaymentStatus.REFUNDED);
    } finally {
      await cleanup();
    }
  });

  test("orphan: 2 回目は prepare 段で already_refunded に抜ける（Refund を増やさない）", async () => {
    const paymentIntentId = `pi_orphan_dup_${crypto.randomUUID()}`;
    nextStripeRefund = {
      id: `re_orphan_dup_${crypto.randomUUID()}`,
      status: "succeeded",
    };
    const { reservationId, cleanup } = await createReservationFixture({
      status: ReservationStatus.CANCELLED,
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: paymentIntentId,
    });

    try {
      await refundOrphanedStripePaymentForCancelledReservation({
        reservationId,
        stripePaymentIntentId: paymentIntentId,
      });
      const second = await refundOrphanedStripePaymentForCancelledReservation({
        reservationId,
        stripePaymentIntentId: paymentIntentId,
      });

      expect(second.outcome).toBe("already_refunded");
      expect(await refundRowsOf(reservationId)).toHaveLength(1);
    } finally {
      await cleanup();
    }
  });
});
