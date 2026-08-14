/**
 * 確定した Refund.status を非終端へ巻き戻せないことの検証。
 *
 * == なぜ要るのか ==
 *
 * `applyConfirmedRefundStatus` の docstring は「webhook の再送・順序前後で
 * 確定済みの行を誤って再書込みしない」と書いていたが、**実装はそれを防げて
 * いなかった**（監査 F-57）。WHERE にあるのは現在値の一致だけで、
 * `succeeded` → `pending` は現在値が一致するので通ってしまう。
 *
 * Stripe は refund.updated の配送順を保証しない。加えてこちら側の dedup は
 * `"retry_unprocessed"` で処理途中に落ちた古い event の再実行を許すので、
 * 「pending の event が 500 → その間に succeeded が処理 → Stripe が pending を
 * 再送」という単一プロセス内の決定的な経路でも起きる。
 *
 * 巻き戻ると `finalizeSettled*Refund` の
 * `aggregate({ where: { status: "succeeded" } })` からその返金額が脱落し、
 * **全額返金済みなのに PARTIALLY_REFUNDED で確定し、返金完了メールの金額も過小**に
 * なる。`failed` / `canceled` からの巻き戻しは、手動対応が必要なインシデントの
 * 記録そのものを消す。
 *
 * == 実 DB を使う理由 ==
 *
 * 判定の結果は「行がどうなったか」でしか確かめられない。WHERE 句を mock に
 * 写経しても、`updateMany` が実際に何件掴むかは分からない。DB 側の
 * append-only trigger (`prevent_refunds_mutation`) が status 列だけ更新を許す、
 * という前提もここでしか確かめられない。
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
type OrchestrationModule =
  typeof import("@/shared/domain/payment/stripe-refund-orchestration");
type EnumsModule = typeof import("@generated/prisma/enums");

let prisma: PrismaModule["prisma"];
let applyConfirmedRefundStatus: OrchestrationModule["applyConfirmedRefundStatus"];
let claimRefundSettlement: OrchestrationModule["claimRefundSettlement"];
let PaymentStatus: EnumsModule["PaymentStatus"];
let ReservationStatus: EnumsModule["ReservationStatus"];

const TAX_RATE_PERCENT = 10;
const TOTAL_WITH_TAX = 11000;

let nextFixtureSortOrder = 2_000_000 + Math.floor(Math.random() * 100_000);

type RefundFixture = {
  stripeRefundId: string;
  cleanup: () => Promise<void>;
};

/** 指定 status の Refund 行を 1 件持つ予約を作る。 */
async function createRefundFixture(status: string): Promise<RefundFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `refund-guard-loc-${suffix}`,
      name: `Refund Guard Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureSortOrder++,
    },
    select: { id: true },
  });
  const space = await prisma.space.create({
    data: {
      slug: `refund-guard-space-${suffix}`,
      name: `Refund Guard Space ${suffix}`,
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
      email: `refund-guard-${suffix}@example.com`,
      emailCanonical: `refund-guard-${suffix}@example.com`,
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
      startTime: new Date("2027-06-01T09:00:00+09:00"),
      endTime: new Date("2027-06-01T11:00:00+09:00"),
      status: ReservationStatus.CONFIRMED,
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: `pi_refund_guard_${suffix}`,
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

  const stripeRefundId = `re_guard_${suffix}`;
  await prisma.refund.create({
    data: {
      reservationId: reservation.id,
      amount: TOTAL_WITH_TAX,
      stripeRefundId,
      refundedByType: "ADMIN",
      status,
    },
  });

  return {
    stripeRefundId,
    cleanup: async () => {
      await deleteRefundsForTest(prisma, { reservationId: reservation.id });
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

async function statusOf(stripeRefundId: string): Promise<string> {
  const row = await prisma.refund.findUniqueOrThrow({
    where: { stripeRefundId },
    select: { status: true },
  });
  return row.status;
}

describeMaybe("Refund.status は終端から非終端へ戻らない", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ applyConfirmedRefundStatus, claimRefundSettlement } =
      await import("@/shared/domain/payment/stripe-refund-orchestration"));
    ({ PaymentStatus, ReservationStatus } =
      await import("@generated/prisma/enums"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("succeeded → pending の巻き戻しを拒否する", async () => {
    const { stripeRefundId, cleanup } = await createRefundFixture("succeeded");

    try {
      const count = await applyConfirmedRefundStatus(
        prisma,
        stripeRefundId,
        "succeeded",
        "pending",
      );

      expect(count).toBe(0);
      expect(await statusOf(stripeRefundId)).toBe("succeeded");
    } finally {
      await cleanup();
    }
  });

  test("failed → pending の巻き戻しも拒否する（インシデント記録を消さない）", async () => {
    const { stripeRefundId, cleanup } = await createRefundFixture("failed");

    try {
      const count = await applyConfirmedRefundStatus(
        prisma,
        stripeRefundId,
        "failed",
        "requires_action",
      );

      expect(count).toBe(0);
      expect(await statusOf(stripeRefundId)).toBe("failed");
    } finally {
      await cleanup();
    }
  });

  test("非終端 → 終端は通す", async () => {
    const { stripeRefundId, cleanup } = await createRefundFixture("pending");

    try {
      const count = await applyConfirmedRefundStatus(
        prisma,
        stripeRefundId,
        "pending",
        "failed",
      );

      expect(count).toBe(1);
      expect(await statusOf(stripeRefundId)).toBe("failed");
    } finally {
      await cleanup();
    }
  });

  test("終端 → 終端は通す（Stripe が後から失敗を確定させる場合）", async () => {
    const { stripeRefundId, cleanup } = await createRefundFixture("succeeded");

    try {
      const count = await applyConfirmedRefundStatus(
        prisma,
        stripeRefundId,
        "succeeded",
        "failed",
      );

      expect(count).toBe(1);
      expect(await statusOf(stripeRefundId)).toBe("failed");
    } finally {
      await cleanup();
    }
  });

  test("巻き戻しを拒否するので claimRefundSettlement が再 claim しない", async () => {
    const { stripeRefundId, cleanup } = await createRefundFixture("failed");

    try {
      // 巻き戻しが通っていたら、この行は非終端に戻って再 claim 可能になる。
      await applyConfirmedRefundStatus(
        prisma,
        stripeRefundId,
        "failed",
        "pending",
      );

      expect(await claimRefundSettlement(prisma, stripeRefundId)).toBe(0);
      expect(await statusOf(stripeRefundId)).toBe("failed");
    } finally {
      await cleanup();
    }
  });
});
