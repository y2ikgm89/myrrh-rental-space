/**
 * 返金累計が決済額を超えないことを DB が拒否することを実測する。
 *
 * アプリ経由だとドメイン層が先に止めるので、trigger を消しても緑になる。
 * ここでは生 SQL で INSERT し、`SET CONSTRAINTS ALL IMMEDIATE` で deferred
 * trigger を発火させる。trigger を DROP すると「超える返金は拒否」が落ちる。
 *
 * CI の test DB は未 seed なので、必要な親行は自分で作る。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type TransactionClient = Parameters<
  Parameters<PrismaModule["prisma"]["$transaction"]>[0]
>[0];

let prisma: PrismaModule["prisma"];

const ROLLBACK = "__refund_total_guard_rollback__";

async function createPaidReservation(
  tx: TransactionClient,
  paidWithTax: number,
): Promise<string> {
  const suffix = crypto.randomUUID();
  const location = await tx.location.create({
    data: {
      slug: `refund-guard-loc-${suffix}`,
      name: `Refund Guard Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: 0,
      isActive: false,
    },
    select: { id: true },
  });
  const space = await tx.space.create({
    data: {
      slug: `refund-guard-space-${suffix}`,
      name: `Refund Guard Space ${suffix}`,
      descriptionJson: {},
      descriptionHtml: "<p>test</p>",
      descriptionPlainText: "test",
      capacity: 10,
      hourlyPrice: 1000,
      mainImageUrl: "https://example.com/space.jpg",
      locationId: location.id,
    },
    select: { id: true },
  });
  const customer = await tx.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: `refund-guard-${suffix}@example.com`,
      emailCanonical: `refund-guard-${suffix}@example.com`,
    },
    select: { id: true },
  });
  const subtotal = Math.round(paidWithTax / 1.1);
  const tax = paidWithTax - subtotal;
  const reservation = await tx.reservation.create({
    data: {
      spaceId: space.id,
      customerId: customer.id,
      startTime: new Date("2099-06-01T10:00:00.000Z"),
      endTime: new Date("2099-06-01T12:00:00.000Z"),
      status: "CONFIRMED",
      basePrice: subtotal,
      totalPrice: subtotal,
      rateBreakdownJson: {
        schemaVersion: 1,
        segments: [],
        totalHours: 2,
        totalBasePrice: subtotal,
        holidayFlags: {},
      },
      taxRateType: "STANDARD",
      taxRate: 10,
      taxAmount: tax,
      totalPriceWithTax: paidWithTax,
      paymentStatus: "PAID",
      guestLastName: "山田",
      guestFirstName: "太郎",
      guestEmail: `refund-guard-${suffix}@example.com`,
    },
    select: { id: true },
  });
  return reservation.id;
}

describeMaybe("refund total within paid (DB guard)", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("範囲内の返金は通る", async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const reservationId = await createPaidReservation(tx, 1100);
        await tx.$executeRawUnsafe(`SET CONSTRAINTS ALL IMMEDIATE`);
        await tx.refund.create({
          data: {
            reservationId,
            amount: 500,
            stripeRefundId: `re_within_${crypto.randomUUID()}`,
            refundedByType: "ADMIN",
            status: "succeeded",
          },
        });
        throw new Error(ROLLBACK);
      });
      expect.unreachable("should have rolled back");
    } catch (error) {
      expect(error).toMatchObject({ message: ROLLBACK });
    }
  });

  test("超える返金は拒否される", async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const reservationId = await createPaidReservation(tx, 1100);
        await tx.$executeRawUnsafe(`SET CONSTRAINTS ALL IMMEDIATE`);
        await tx.refund.create({
          data: {
            reservationId,
            amount: 1200,
            stripeRefundId: `re_over_${crypto.randomUUID()}`,
            refundedByType: "ADMIN",
            status: "succeeded",
          },
        });
        throw new Error(ROLLBACK);
      });
      expect.unreachable("over-refund should have been rejected");
    } catch (error) {
      expect(String(error)).toMatch(/refund total|check_violation|23514/i);
    }
  });

  test("failed は合計に入らない", async () => {
    try {
      await prisma.$transaction(async (tx) => {
        const reservationId = await createPaidReservation(tx, 1100);
        await tx.$executeRawUnsafe(`SET CONSTRAINTS ALL IMMEDIATE`);
        await tx.refund.create({
          data: {
            reservationId,
            amount: 1200,
            stripeRefundId: `re_failed_${crypto.randomUUID()}`,
            refundedByType: "ADMIN",
            status: "failed",
          },
        });
        await tx.refund.create({
          data: {
            reservationId,
            amount: 1100,
            stripeRefundId: `re_ok_${crypto.randomUUID()}`,
            refundedByType: "ADMIN",
            status: "succeeded",
          },
        });
        throw new Error(ROLLBACK);
      });
      expect.unreachable("should have rolled back");
    } catch (error) {
      expect(error).toMatchObject({ message: ROLLBACK });
    }
  });

  test("trigger を DROP すると超過返金が通ってしまう", async () => {
    // 一時 DROP → 超過 INSERT が通る → 復元。gate が空振りしていないことの自己検査。
    await prisma.$executeRawUnsafe(
      `DROP TRIGGER IF EXISTS refunds_total_within_paid_check ON refunds`,
    );
    try {
      try {
        await prisma.$transaction(async (tx) => {
          const reservationId = await createPaidReservation(tx, 1100);
          await tx.refund.create({
            data: {
              reservationId,
              amount: 1200,
              stripeRefundId: `re_no_trigger_${crypto.randomUUID()}`,
              refundedByType: "ADMIN",
              status: "succeeded",
            },
          });
          throw new Error(ROLLBACK);
        });
        expect.unreachable("should have rolled back");
      } catch (error) {
        expect(error).toMatchObject({ message: ROLLBACK });
      }
    } finally {
      await prisma.$executeRawUnsafe(`
        CREATE CONSTRAINT TRIGGER refunds_total_within_paid_check
          AFTER INSERT OR UPDATE OF amount, status, reservation_id, event_registration_id ON refunds
          DEFERRABLE INITIALLY DEFERRED
          FOR EACH ROW EXECUTE FUNCTION assert_refund_total_within_paid()
      `);
    }
  });
});
