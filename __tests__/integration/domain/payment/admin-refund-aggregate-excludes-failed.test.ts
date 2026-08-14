/**
 * 管理画面が読む「返金済み累計」から failed / canceled を除くことの検証。
 *
 * == なぜ要るのか ==
 *
 * `getReservationByIdQuery` の `refunds` select は status を絞っていなかった
 * （監査 F-50）。UI 側 (`ReservationDetail` / `RefundDialog`) は取れた行を
 * そのまま `reduce` するので、**失敗した返金まで「返金済み」に数えられる**。
 *
 * 実害は 2 つ:
 *
 * - 全額の返金が failed に終わった申込で、累計 = 全額と表示されて返金ボタンが
 *   消える。ドメイン (`REFUND_AGGREGATE_EXCLUDED_STATUSES`) と DB
 *   (`assert_refund_total_within_paid`) は failed を除外しているので、
 *   **本来は受理される再返金へ UI から到達できない**。
 * - 部分返金が混ざると数字自体が嘘になる。10,000 円のうち 3,000 succeeded /
 *   2,000 failed のとき、ドメインの残額は 7,000 円なのに UI は
 *   「累計 ¥5,000 / 残額 ¥5,000」と出し、5,000 円超の入力を拒否する。
 *
 * == 実 DB を使う理由 ==
 *
 * 欠陥は「query が何行返すか」にある。UI の unit テストは `cumulativeRefunded` を
 * props で直接与えるので、その値の算出元を一切見ていない。行を実際に書いて
 * query を通すことでしか確かめられない。
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

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: () => Promise.resolve(),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type AdminQueriesModule =
  typeof import("@/shared/domain/reservations/admin-queries");
type EnumsModule = typeof import("@generated/prisma/enums");

let prisma: PrismaModule["prisma"];
let getReservationByIdQuery: AdminQueriesModule["getReservationByIdQuery"];
let PaymentStatus: EnumsModule["PaymentStatus"];
let ReservationStatus: EnumsModule["ReservationStatus"];

const TAX_RATE_PERCENT = 10;
const TOTAL_WITH_TAX = 11000;

let nextFixtureSortOrder = 3_000_000 + Math.floor(Math.random() * 100_000);

type Fixture = {
  reservationId: string;
  cleanup: () => Promise<void>;
};

/** 指定した (金額, status) の Refund 行を持つ PAID 予約を作る。 */
async function createReservationWithRefunds(
  refunds: readonly { amount: number; status: string }[],
): Promise<Fixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `refund-agg-loc-${suffix}`,
      name: `Refund Agg Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureSortOrder++,
    },
    select: { id: true },
  });
  const space = await prisma.space.create({
    data: {
      slug: `refund-agg-space-${suffix}`,
      name: `Refund Agg Space ${suffix}`,
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
      email: `refund-agg-${suffix}@example.com`,
      emailCanonical: `refund-agg-${suffix}@example.com`,
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
      startTime: new Date("2027-07-01T09:00:00+09:00"),
      endTime: new Date("2027-07-01T11:00:00+09:00"),
      status: ReservationStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: `pi_refund_agg_${suffix}`,
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

  for (const [index, refund] of refunds.entries()) {
    await prisma.refund.create({
      data: {
        reservationId: reservation.id,
        amount: refund.amount,
        stripeRefundId: `re_agg_${suffix}_${index}`,
        refundedByType: "ADMIN",
        status: refund.status,
      },
    });
  }

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

/** 管理画面と同じ計算（`ReservationDetail.tsx` の reduce）。 */
function cumulativeRefundedOf(
  refunds: readonly { amount: number }[] | undefined,
): number {
  return (refunds ?? []).reduce((sum, refund) => sum + refund.amount, 0);
}

describeMaybe("管理画面の返金累計は failed / canceled を数えない", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ getReservationByIdQuery } =
      await import("@/shared/domain/reservations/admin-queries"));
    ({ PaymentStatus, ReservationStatus } =
      await import("@generated/prisma/enums"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("失敗した返金だけの予約は累計 0 円（＝返金導線が残る）", async () => {
    const { reservationId, cleanup } = await createReservationWithRefunds([
      { amount: TOTAL_WITH_TAX, status: "failed" },
    ]);

    try {
      const reservation = await getReservationByIdQuery(reservationId);
      expect(cumulativeRefundedOf(reservation?.refunds)).toBe(0);
    } finally {
      await cleanup();
    }
  });

  test("succeeded と failed が混在しても succeeded だけを数える", async () => {
    const { reservationId, cleanup } = await createReservationWithRefunds([
      { amount: 3000, status: "succeeded" },
      { amount: 2000, status: "failed" },
    ]);

    try {
      const reservation = await getReservationByIdQuery(reservationId);
      // ドメイン側の残額（7,000 円）と一致する。絞らないと 5,000 円になる。
      expect(cumulativeRefundedOf(reservation?.refunds)).toBe(3000);
    } finally {
      await cleanup();
    }
  });

  test("canceled も除外する", async () => {
    const { reservationId, cleanup } = await createReservationWithRefunds([
      { amount: 1000, status: "succeeded" },
      { amount: 4000, status: "canceled" },
    ]);

    try {
      const reservation = await getReservationByIdQuery(reservationId);
      expect(cumulativeRefundedOf(reservation?.refunds)).toBe(1000);
    } finally {
      await cleanup();
    }
  });

  test("未確定 (pending) は数える（返金は進行中で、二重返金を許さない）", async () => {
    const { reservationId, cleanup } = await createReservationWithRefunds([
      { amount: 2500, status: "pending" },
    ]);

    try {
      const reservation = await getReservationByIdQuery(reservationId);
      expect(cumulativeRefundedOf(reservation?.refunds)).toBe(2500);
    } finally {
      await cleanup();
    }
  });
});
