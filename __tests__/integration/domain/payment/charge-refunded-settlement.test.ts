/**
 * `charge.refunded` webhook の反映本体を、実 DB で走らせる。
 *
 * == なぜ要るのか ==
 *
 * `applyChargeRefundIdempotent` は Stripe からの webhook でしか呼ばれない。
 * 人は介在せず、間違っても誰も気付かない。にもかかわらず既存のテスト
 * (`__tests__/unit/api/stripe-webhook.test.ts`) は
 * `mock.module` でこの関数ごと差し替えており、**本体は 1 行も走っていなかった**。
 * 固定されているのは「webhook がこの関数を呼ぶ」という配線だけ。
 *
 * その結果、監査 F-54 / F-55 の 2 つの欠陥が誰にも観測されなかった:
 *
 * - Refund 行に Stripe の実 `status` を渡しておらず、schema の
 *   `@default("succeeded")` で**未確定の返金が「返金済み」として INSERT** される。
 *   以後 `claimRefundSettlement` の `status: { notIn: [...] }` が 0 件になり、
 *   返金完了メールと完了 AuditLog が永久に出ない。
 * - charge の金額比較だけで `paymentStatus` を終端 (REFUNDED) へ焼く。後で
 *   `refund.failed` が来ても戻す経路が無く、`refundReservationPaymentCommand` の
 *   入口 gate が PAID / PARTIALLY_REFUNDED しか受けないため**管理画面から
 *   再返金もできなくなる**。
 *
 * どちらも「書いた後の行を読む」ことでしか確かめられない。schema の default も
 * `stripeRefundId` の unique index も mock には無い。
 *
 * == 何を mock するか ==
 *
 * AuditLog だけ（hash-chain が共有 test-db を汚染するため）。この経路は Stripe を
 * 叩かないので Stripe SDK の mock も要らない。ドメインと Prisma は本物を通す。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { REFUNDED_BY_TYPE } from "@/shared/lib/validations/enums/refund-attribution";
import { deleteRefundsForTest } from "../../../helpers/refund-test-cleanup";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// AuditLog は hash-chain を実 DB に積むので共有 test-db を汚染する。
mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: () => Promise.resolve(),
}));

const mockLogError = mock((..._args: unknown[]) => undefined);
const mockCreateNotificationCommand = mock(() => Promise.resolve());
const actualErrors = await import("@/shared/lib/errors/server");
mock.module("@/shared/lib/errors/server", () => ({
  ...actualErrors,
  logError: mockLogError,
}));
mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: mockCreateNotificationCommand,
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type PaymentQueriesModule =
  typeof import("@/shared/domain/reservations/payment-queries");
type EnumsModule = typeof import("@generated/prisma/enums");

let prisma: PrismaModule["prisma"];
let applyChargeRefundIdempotent: PaymentQueriesModule["applyChargeRefundIdempotent"];
let PaymentStatus: EnumsModule["PaymentStatus"];
let ReservationStatus: EnumsModule["ReservationStatus"];

/** 予約の税率。fixture はアプリと同じ向き（税抜 → round）で税額を導く。 */
const TAX_RATE_PERCENT = 10;
/** 税抜からの導出で再現できる税込額（`reservations_tax_amount_derivation_check`）。 */
const TOTAL_WITH_TAX = 11000;

let nextFixtureSortOrder = 1_000_000 + Math.floor(Math.random() * 100_000);

type ReservationFixture = {
  reservationId: string;
  cleanup: () => Promise<void>;
};

async function createPaidReservationFixture(): Promise<ReservationFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `charge-refund-loc-${suffix}`,
      name: `Charge Refund Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureSortOrder++,
    },
    select: { id: true },
  });
  const space = await prisma.space.create({
    data: {
      slug: `charge-refund-space-${suffix}`,
      name: `Charge Refund Space ${suffix}`,
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
      email: `charge-refund-${suffix}@example.com`,
      emailCanonical: `charge-refund-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const basePrice = Math.round(
    (TOTAL_WITH_TAX * 100) / (100 + TAX_RATE_PERCENT),
  );
  const taxAmount = Math.round((basePrice * TAX_RATE_PERCENT) / 100);

  const reservation = await prisma.reservation.create({
    data: {
      customerId: customer.id,
      spaceId: space.id,
      startTime: new Date("2027-05-01T09:00:00+09:00"),
      endTime: new Date("2027-05-01T11:00:00+09:00"),
      status: ReservationStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: `pi_charge_refund_${suffix}`,
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
    select: { amount: true, stripeRefundId: true, status: true },
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

async function refundedByTypeOf(reservationId: string): Promise<string> {
  const row = await prisma.refund.findFirstOrThrow({
    where: { reservationId },
    select: { refundedByType: true },
    orderBy: { createdAt: "asc" },
  });
  return row.refundedByType;
}

describeMaybe("charge.refunded は Stripe の実 status で確定を判断する", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ applyChargeRefundIdempotent } =
      await import("@/shared/domain/reservations/payment-queries"));
    ({ PaymentStatus, ReservationStatus } =
      await import("@generated/prisma/enums"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("未確定 (pending) の返金は status を保存し、paymentStatus を動かさない", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture();
    const stripeRefundId = `re_pending_${crypto.randomUUID()}`;

    try {
      await applyChargeRefundIdempotent({
        reservationId,
        chargeAmount: TOTAL_WITH_TAX,
        amountRefunded: TOTAL_WITH_TAX,
        currency: "jpy",
        latestRefund: {
          id: stripeRefundId,
          amount: TOTAL_WITH_TAX,
          status: "pending",
          metadata: null,
        },
      });

      // Refund 行は作られるが "pending" のまま。ここが default "succeeded" に
      // 落ちると claimRefundSettlement が二度と掴めず、返金完了メールが消える。
      expect(await refundRowsOf(reservationId)).toEqual([
        { amount: TOTAL_WITH_TAX, stripeRefundId, status: "pending" },
      ]);
      // 未確定のまま REFUNDED を焼かない。焼くと refund.failed 後に戻せない。
      expect(await paymentStatusOf(reservationId)).toBe(PaymentStatus.PAID);
    } finally {
      await cleanup();
    }
  });

  test("確定 (succeeded) の全額返金は REFUNDED まで進める", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture();
    const stripeRefundId = `re_full_${crypto.randomUUID()}`;

    try {
      await applyChargeRefundIdempotent({
        reservationId,
        chargeAmount: TOTAL_WITH_TAX,
        amountRefunded: TOTAL_WITH_TAX,
        currency: "jpy",
        latestRefund: {
          id: stripeRefundId,
          amount: TOTAL_WITH_TAX,
          status: "succeeded",
          metadata: null,
        },
      });

      expect(await refundRowsOf(reservationId)).toEqual([
        { amount: TOTAL_WITH_TAX, stripeRefundId, status: "succeeded" },
      ]);
      expect(await paymentStatusOf(reservationId)).toBe(PaymentStatus.REFUNDED);
    } finally {
      await cleanup();
    }
  });

  test("確定した部分返金は PARTIALLY_REFUNDED で止まる", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture();
    const stripeRefundId = `re_partial_${crypto.randomUUID()}`;
    const partialAmount = 3000;

    try {
      await applyChargeRefundIdempotent({
        reservationId,
        chargeAmount: TOTAL_WITH_TAX,
        amountRefunded: partialAmount,
        currency: "jpy",
        latestRefund: {
          id: stripeRefundId,
          amount: partialAmount,
          status: "succeeded",
          metadata: null,
        },
      });

      expect(await paymentStatusOf(reservationId)).toBe(
        PaymentStatus.PARTIALLY_REFUNDED,
      );
    } finally {
      await cleanup();
    }
  });

  test("同じ stripeRefundId の再配信は行を増やさない", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture();
    const stripeRefundId = `re_replay_${crypto.randomUUID()}`;
    const payload = {
      reservationId,
      chargeAmount: TOTAL_WITH_TAX,
      amountRefunded: TOTAL_WITH_TAX,
      currency: "jpy",
      latestRefund: {
        id: stripeRefundId,
        amount: TOTAL_WITH_TAX,
        status: "succeeded",
        metadata: null,
      },
    } as const;

    try {
      await applyChargeRefundIdempotent(payload);
      await applyChargeRefundIdempotent(payload);

      // unique index の衝突を握りつぶす経路。mock には index が無いので
      // ここでしか確かめられない。
      expect(await refundRowsOf(reservationId)).toHaveLength(1);
      expect(await paymentStatusOf(reservationId)).toBe(PaymentStatus.REFUNDED);
    } finally {
      await cleanup();
    }
  });

  test("USD 1250 cents は float を書かず throw もしない (CRITICAL)", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture();
    const stripeRefundId = `re_usd_frac_${crypto.randomUUID()}`;
    mockLogError.mockClear();
    mockCreateNotificationCommand.mockClear();

    try {
      await applyChargeRefundIdempotent({
        reservationId,
        chargeAmount: 5000,
        amountRefunded: 1250,
        currency: "usd",
        latestRefund: {
          id: stripeRefundId,
          amount: 1250,
          status: "succeeded",
          metadata: null,
        },
      });

      expect(await refundRowsOf(reservationId)).toEqual([]);
      expect(await paymentStatusOf(reservationId)).toBe(PaymentStatus.PAID);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.objectContaining({ name: "NonIntegerAppAmountError" }),
        expect.objectContaining({ severity: "CRITICAL" }),
      );
      expect(mockCreateNotificationCommand).toHaveBeenCalled();
    } finally {
      await cleanup();
    }
  });

  test("refund object を含まない配送は何も書かない", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture();

    try {
      await applyChargeRefundIdempotent({
        reservationId,
        chargeAmount: TOTAL_WITH_TAX,
        amountRefunded: TOTAL_WITH_TAX,
        currency: "jpy",
        latestRefund: null,
      });

      // どの refund が確定したのか判定できない以上、終端状態を焼いてはいけない。
      expect(await refundRowsOf(reservationId)).toEqual([]);
      expect(await paymentStatusOf(reservationId)).toBe(PaymentStatus.PAID);
    } finally {
      await cleanup();
    }
  });

  test("metadata.initiator が ADMIN なら refundedByType を ADMIN で書く", async () => {
    const { reservationId, cleanup } = await createPaidReservationFixture();
    const stripeRefundId = `re_attr_admin_${crypto.randomUUID()}`;

    try {
      await applyChargeRefundIdempotent({
        reservationId,
        chargeAmount: TOTAL_WITH_TAX,
        amountRefunded: TOTAL_WITH_TAX,
        currency: "jpy",
        latestRefund: {
          id: stripeRefundId,
          amount: TOTAL_WITH_TAX,
          status: "succeeded",
          metadata: { initiator: REFUNDED_BY_TYPE.ADMIN },
        },
      });

      expect(await refundedByTypeOf(reservationId)).toBe(
        REFUNDED_BY_TYPE.ADMIN,
      );
    } finally {
      await cleanup();
    }
  });

  test("initiator が無い / 未知なら refundedByType は STRIPE_DASHBOARD", async () => {
    const { reservationId: missingId, cleanup: cleanupMissing } =
      await createPaidReservationFixture();
    const { reservationId: unknownId, cleanup: cleanupUnknown } =
      await createPaidReservationFixture();

    try {
      await applyChargeRefundIdempotent({
        reservationId: missingId,
        chargeAmount: TOTAL_WITH_TAX,
        amountRefunded: TOTAL_WITH_TAX,
        currency: "jpy",
        latestRefund: {
          id: `re_attr_missing_${crypto.randomUUID()}`,
          amount: TOTAL_WITH_TAX,
          status: "succeeded",
          metadata: null,
        },
      });
      await applyChargeRefundIdempotent({
        reservationId: unknownId,
        chargeAmount: TOTAL_WITH_TAX,
        amountRefunded: TOTAL_WITH_TAX,
        currency: "jpy",
        latestRefund: {
          id: `re_attr_unknown_${crypto.randomUUID()}`,
          amount: TOTAL_WITH_TAX,
          status: "succeeded",
          metadata: { initiator: "NOT_A_REAL_ACTOR" },
        },
      });

      expect(await refundedByTypeOf(missingId)).toBe(
        REFUNDED_BY_TYPE.STRIPE_DASHBOARD,
      );
      expect(await refundedByTypeOf(unknownId)).toBe(
        REFUNDED_BY_TYPE.STRIPE_DASHBOARD,
      );
    } finally {
      await cleanupMissing();
      await cleanupUnknown();
    }
  });
});
