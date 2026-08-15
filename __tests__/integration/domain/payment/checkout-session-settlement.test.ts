/**
 * checkout.session.* の reservation 書込本体を実 DB で走らせる。
 *
 * unit (`stripe-webhook.test.ts`) は domain を mock.module で差し替え、
 * 「どの mock がどの引数で呼ばれたか」しか見ていなかった。PAID / FAILED /
 * PaymentIntent の行は誰も読んでいない。
 *
 * AuditLog / notification は hash-chain と副作用のため mock。Stripe は叩かない。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: () => Promise.resolve(),
}));
mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: () => Promise.resolve(),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type PaymentQueriesModule =
  typeof import("@/shared/domain/reservations/payment-queries");
type EnumsModule = typeof import("@generated/prisma/enums");

let prisma: PrismaModule["prisma"];
let claimReservationAsPaid: PaymentQueriesModule["claimReservationAsPaid"];
let claimReservationAsFailed: PaymentQueriesModule["claimReservationAsFailed"];
let savePaymentIntentId: PaymentQueriesModule["savePaymentIntentId"];
let PaymentStatus: EnumsModule["PaymentStatus"];
let ReservationStatus: EnumsModule["ReservationStatus"];

const TAX_RATE_PERCENT = 10;
const TOTAL_WITH_TAX = 11000;

let nextFixtureSortOrder = 2_000_000 + Math.floor(Math.random() * 100_000);

type ReservationFixture = {
  reservationId: string;
  sessionId: string;
  cleanup: () => Promise<void>;
};

async function createCheckoutReservationFixture(input?: {
  paymentStatus?: "UNPAID" | "PENDING" | "PAID";
  stripePaymentIntentId?: string | null;
}): Promise<ReservationFixture> {
  const suffix = crypto.randomUUID();
  const sessionId = `cs_checkout_${suffix}`;

  const location = await prisma.location.create({
    data: {
      slug: `checkout-settle-loc-${suffix}`,
      name: `Checkout Settle Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureSortOrder++,
    },
    select: { id: true },
  });
  const space = await prisma.space.create({
    data: {
      slug: `checkout-settle-space-${suffix}`,
      name: `Checkout Settle Space ${suffix}`,
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
      email: `checkout-settle-${suffix}@example.com`,
      emailCanonical: `checkout-settle-${suffix}@example.com`,
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
      paymentStatus: input?.paymentStatus ?? PaymentStatus.UNPAID,
      stripeCheckoutSessionId: sessionId,
      stripePaymentIntentId: input?.stripePaymentIntentId ?? null,
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
    sessionId,
    cleanup: async () => {
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

async function paymentRowOf(reservationId: string) {
  return prisma.reservation.findUniqueOrThrow({
    where: { id: reservationId },
    select: {
      paymentStatus: true,
      stripePaymentIntentId: true,
      paidAt: true,
      paymentFailedAt: true,
    },
  });
}

describeMaybe("checkout.session は実 DB に payment 状態を書く", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ claimReservationAsPaid, claimReservationAsFailed, savePaymentIntentId } =
      await import("@/shared/domain/reservations/payment-queries"));
    ({ PaymentStatus, ReservationStatus } =
      await import("@generated/prisma/enums"));
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  test("UNPAID を claim すると PAID と PaymentIntent を書く", async () => {
    const { reservationId, cleanup } = await createCheckoutReservationFixture();
    const paymentIntentId = `pi_checkout_${crypto.randomUUID()}`;

    try {
      const claimed = await claimReservationAsPaid(reservationId, {
        stripePaymentIntentId: paymentIntentId,
      });
      const row = await paymentRowOf(reservationId);

      expect(claimed?.paymentStatus).toBe(PaymentStatus.PAID);
      expect(row.paymentStatus).toBe(PaymentStatus.PAID);
      expect(row.stripePaymentIntentId).toBe(paymentIntentId);
      expect(row.paidAt).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  test("既に PAID なら claim は null で行を上書きしない", async () => {
    const existingPi = `pi_already_${crypto.randomUUID()}`;
    const { reservationId, cleanup } = await createCheckoutReservationFixture({
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: existingPi,
    });

    try {
      const claimed = await claimReservationAsPaid(reservationId, {
        stripePaymentIntentId: `pi_stale_${crypto.randomUUID()}`,
      });
      const row = await paymentRowOf(reservationId);

      expect(claimed).toBeNull();
      expect(row.paymentStatus).toBe(PaymentStatus.PAID);
      expect(row.stripePaymentIntentId).toBe(existingPi);
    } finally {
      await cleanup();
    }
  });

  test("unpaid completed は PI だけ書き paymentStatus は動かさない", async () => {
    const { reservationId, sessionId, cleanup } =
      await createCheckoutReservationFixture({
        paymentStatus: PaymentStatus.PENDING,
      });
    const paymentIntentId = `pi_async_${crypto.randomUUID()}`;

    try {
      await savePaymentIntentId(reservationId, paymentIntentId, sessionId);
      const row = await paymentRowOf(reservationId);

      expect(row.paymentStatus).toBe(PaymentStatus.PENDING);
      expect(row.stripePaymentIntentId).toBe(paymentIntentId);
    } finally {
      await cleanup();
    }
  });

  test("session 不一致の PI 保存は行を動かさない", async () => {
    const { reservationId, cleanup } = await createCheckoutReservationFixture({
      paymentStatus: PaymentStatus.PENDING,
    });

    try {
      await savePaymentIntentId(
        reservationId,
        `pi_wrong_session_${crypto.randomUUID()}`,
        "cs_other_session",
      );
      const row = await paymentRowOf(reservationId);

      expect(row.paymentStatus).toBe(PaymentStatus.PENDING);
      expect(row.stripePaymentIntentId).toBeNull();
    } finally {
      await cleanup();
    }
  });

  test("session 一致の failed claim は FAILED と paymentFailedAt を書く", async () => {
    const { reservationId, sessionId, cleanup } =
      await createCheckoutReservationFixture({
        paymentStatus: PaymentStatus.PENDING,
      });

    try {
      const claimed = await claimReservationAsFailed(reservationId, sessionId);
      const row = await paymentRowOf(reservationId);

      expect(claimed).toBe(true);
      expect(row.paymentStatus).toBe(PaymentStatus.FAILED);
      expect(row.paymentFailedAt).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  test("session 不一致の failed claim は PENDING のまま", async () => {
    const { reservationId, cleanup } = await createCheckoutReservationFixture({
      paymentStatus: PaymentStatus.PENDING,
    });

    try {
      const claimed = await claimReservationAsFailed(
        reservationId,
        "cs_stale_session",
      );
      const row = await paymentRowOf(reservationId);

      expect(claimed).toBe(false);
      expect(row.paymentStatus).toBe(PaymentStatus.PENDING);
      expect(row.paymentFailedAt).toBeNull();
    } finally {
      await cleanup();
    }
  });

  test("既に PAID の failed claim は false で PAID を残す", async () => {
    const { reservationId, sessionId, cleanup } =
      await createCheckoutReservationFixture({
        paymentStatus: PaymentStatus.PAID,
        stripePaymentIntentId: `pi_paid_${crypto.randomUUID()}`,
      });

    try {
      const claimed = await claimReservationAsFailed(reservationId, sessionId);
      const row = await paymentRowOf(reservationId);

      expect(claimed).toBe(false);
      expect(row.paymentStatus).toBe(PaymentStatus.PAID);
    } finally {
      await cleanup();
    }
  });

  test("soft-delete 済みの UNPAID は claim しない", async () => {
    const { reservationId, cleanup } = await createCheckoutReservationFixture();

    try {
      await prisma.reservation.update({
        where: { id: reservationId },
        data: { deletedAt: new Date() },
      });
      const claimed = await claimReservationAsPaid(reservationId, {
        stripePaymentIntentId: `pi_deleted_${crypto.randomUUID()}`,
      });
      const row = await paymentRowOf(reservationId);

      expect(claimed).toBeNull();
      expect(row.paymentStatus).toBe(PaymentStatus.UNPAID);
      expect(row.stripePaymentIntentId).toBeNull();
    } finally {
      await cleanup();
    }
  });
});
