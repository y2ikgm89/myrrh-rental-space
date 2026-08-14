/**
 * 自動返金の確定が「累積額」で REFUNDED / PARTIALLY_REFUNDED を決めることの検証。
 *
 * == なぜ要るのか ==
 *
 * 確定処理は `refundedByType` が `AUTO_*` なら **`willBeFullyRefunded = true` の
 * 決め打ち**で、金額を一切見ずに `REFUNDED` へ遷移させていた（監査 F-49）。
 *
 * 「自動返金は必ず残額全額」という前提が置かれていたが、`AUTO_ON_CANCEL` は
 * **返金ポリシーの按分**（48h 前なら 50% 等）で部分返金になりうる。総額 10000 の
 * 予約を 50% ポリシーでキャンセルすると 5000 だけ返るのに、確定時に `REFUNDED` に
 * なる。すると:
 *
 * - 残 5000 が返っていないのに「全額返金済み」と表示される
 * - 以後の返金入口は `PAID` / `PARTIALLY_REFUNDED` しか許さないので、
 *   **手動でも返せなくなる**
 * - 監査ログの `refundedAmount` は正しい 5000 なので、突き合わせないと気づけない
 *
 * == 何を mock し、何を通すか ==
 *
 * mock は無し。判定そのものが実 DB の集計（`Refund` の `_sum`）に依っている。
 *
 * == 実行条件 ==
 *
 * 実 Postgres を要求する。`bun run test:integration` が test-db を用意する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PaymentStatus, TaxRateType } from "@generated/prisma/enums";

import { deleteRefundsForTest } from "../../../helpers/refund-test-cleanup";
import { installEmailLibDispatchMock } from "../../../support/email-lib-dispatch-mock";

// 確定後の返金完了メールは検証対象ではない。実モジュールを通すと
// `getEmailDeliverySettings` の `cacheLife()` が cacheComponents 外で throw する。
installEmailLibDispatchMock();

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type PaymentQueriesModule =
  typeof import("@/shared/domain/reservations/payment-queries");

let prisma: PrismaModule["prisma"];
let finalizeSettledReservationRefund: PaymentQueriesModule["finalizeSettledReservationRefund"];

const TOTAL_WITH_TAX = 11000;

function randomSortOrder(): number {
  return Math.floor(Math.random() * 500_000_000) + 900_000_000;
}

type Fixture = {
  spaceId: string;
  customerId: string;
  cleanup: () => Promise<void>;
};

let fixture: Fixture;
const createdReservationIds: string[] = [];
let slotOffsetHours = 0;

async function createFixture(): Promise<Fixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `auto-refund-loc-${suffix}`,
      name: `Auto Refund Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: randomSortOrder(),
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

  return {
    spaceId: space.id,
    customerId: customer.id,
    cleanup: async () => {
      // Refund は DB 層で append-only。削除には trigger の bypass GUC が要る。
      await deleteRefundsForTest(prisma, {
        reservationId: { in: createdReservationIds },
      });
      await prisma.reservation.deleteMany({
        where: { id: { in: createdReservationIds } },
      });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

/** PAID の予約と、確定待ち（status="pending"）の Refund を 1 件ずつ作る。 */
async function createPaidReservationWithPendingRefund(input: {
  refundAmount: number;
}): Promise<{ reservationId: string; stripeRefundId: string }> {
  const base = new Date("2027-06-01T01:00:00Z");
  const startTime = new Date(
    base.getTime() + slotOffsetHours++ * 60 * 60 * 1000,
  );
  const suffix = crypto.randomUUID();

  const reservation = await prisma.reservation.create({
    data: {
      spaceId: fixture.spaceId,
      customerId: fixture.customerId,
      startTime,
      endTime: new Date(startTime.getTime() + 60 * 60 * 1000),
      status: "CANCELLED",
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: `pi_${suffix.replaceAll("-", "")}`,
      basePrice: 10000,
      totalPrice: 10000,
      rateBreakdownJson: {
        schemaVersion: 1,
        segments: [],
        totalHours: 0,
        totalBasePrice: 0,
        holidayFlags: {},
      },
      taxRateType: TaxRateType.STANDARD,
      taxRate: 10,
      taxAmount: 1000,
      totalPriceWithTax: TOTAL_WITH_TAX,
    },
    select: { id: true },
  });
  createdReservationIds.push(reservation.id);

  const stripeRefundId = `re_${suffix.replaceAll("-", "")}`;
  await prisma.refund.create({
    data: {
      reservationId: reservation.id,
      stripeRefundId,
      amount: input.refundAmount,
      status: "pending",
      refundedByType: "AUTO_ON_CANCEL",
    },
  });

  return { reservationId: reservation.id, stripeRefundId };
}

describeMaybe("自動返金の確定は累積額で判定する", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ finalizeSettledReservationRefund } =
      await import("@/shared/domain/reservations/payment-queries"));
    fixture = await createFixture();
  });

  afterAll(async () => {
    await fixture.cleanup();
    await prisma.$disconnect();
  });

  test("ポリシー按分の部分返金は PARTIALLY_REFUNDED で止まる", async () => {
    const partial = Math.floor(TOTAL_WITH_TAX / 2);
    const { reservationId, stripeRefundId } =
      await createPaidReservationWithPendingRefund({ refundAmount: partial });

    const claimed = await finalizeSettledReservationRefund(
      reservationId,
      stripeRefundId,
      partial,
      "AUTO_ON_CANCEL",
    );

    expect(claimed).toBe(true);
    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      select: { paymentStatus: true },
    });
    // ここが REFUNDED だと、残額が返っていないのに返金入口が閉じる。
    expect(after.paymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
  });

  test("全額の自動返金は REFUNDED まで進む", async () => {
    const { reservationId, stripeRefundId } =
      await createPaidReservationWithPendingRefund({
        refundAmount: TOTAL_WITH_TAX,
      });

    const claimed = await finalizeSettledReservationRefund(
      reservationId,
      stripeRefundId,
      TOTAL_WITH_TAX,
      "AUTO_ON_CANCEL",
    );

    expect(claimed).toBe(true);
    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      select: { paymentStatus: true },
    });
    expect(after.paymentStatus).toBe(PaymentStatus.REFUNDED);
  });

  test("部分返金を 2 回積んで総額に達したら REFUNDED", async () => {
    const half = Math.floor(TOTAL_WITH_TAX / 2);
    const { reservationId, stripeRefundId } =
      await createPaidReservationWithPendingRefund({ refundAmount: half });

    await finalizeSettledReservationRefund(
      reservationId,
      stripeRefundId,
      half,
      "AUTO_ON_CANCEL",
    );

    const secondRefundId = `re_${crypto.randomUUID().replaceAll("-", "")}`;
    await prisma.refund.create({
      data: {
        reservationId,
        stripeRefundId: secondRefundId,
        amount: TOTAL_WITH_TAX - half,
        status: "pending",
        refundedByType: "ADMIN",
      },
    });

    await finalizeSettledReservationRefund(
      reservationId,
      secondRefundId,
      TOTAL_WITH_TAX - half,
      "ADMIN",
    );

    const after = await prisma.reservation.findUniqueOrThrow({
      where: { id: reservationId },
      select: { paymentStatus: true },
    });
    expect(after.paymentStatus).toBe(PaymentStatus.REFUNDED);
  });
});
