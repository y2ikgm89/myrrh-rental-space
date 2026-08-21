/**
 * N-02: 管理画面返金で Stripe が failed を返したあと、同額再試行が別の
 * idempotency key を使うことの検証。
 *
 * キーが `reservation-refund-{id}-{newCumulative}` だけだと、failed 行が
 * 集計から外れたあとの同額再試行が同一キーになり、Stripe は初回の失敗応答を
 * 24 時間 replay する。admin 経路は除外件数を末尾に足す
 * (`reservation-refund-{id}-{newCumulative}-{excludedAttemptCount}`)。
 *
 * == 実行条件 ==
 * 実 Postgres を要求する。`bun run test:integration` は docker-compose の
 * test-db 既定値を注入する。直接 `bun test` でこのファイルを実行し
 * `TEST_DATABASE_URL` が未設定の場合のみ describe ごと skip する。
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
import { deleteRefundsForTest } from "../../../helpers/refund-test-cleanup";
import { definite, nthCall } from "../../../support/definite";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

const mockRefundsCreate = mock<
  (
    args: Record<string, unknown>,
    opts?: { idempotencyKey?: string },
  ) => Promise<{ id: string; status: string }>
>((_args, _opts) => Promise.resolve({ id: "", status: "succeeded" }));

mock.module("@/shared/lib/stripe", () => ({
  getStripeClient: () => ({
    client: {
      refunds: { create: mockRefundsCreate },
    },
  }),
}));

const actualAvailability = await import("@/shared/domain/payment/availability");
mock.module("@/shared/domain/payment/availability", () => ({
  ...actualAvailability,
  assertOnlinePaymentAvailable: () =>
    Promise.resolve({
      stripeSecretKey: "sk_test_dummy",
      stripeWebhookSecret: "whsec_dummy",
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeCurrency: "jpy",
      stripePaymentMethodTypes: ["card"],
    }),
  assertStripeCredentialsConfigured: () =>
    Promise.resolve({
      stripeSecretKey: "sk_test_dummy",
      stripeWebhookSecret: "whsec_dummy",
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeCurrency: "jpy",
      stripePaymentMethodTypes: ["card"],
    }),
}));

const mockCreateAuditLogRecord = mock<
  (input: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve());

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: (input: Record<string, unknown>) =>
    mockCreateAuditLogRecord(input),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type PaymentCommandsModule =
  typeof import("@/shared/domain/reservations/payment-commands");
type PrismaEnumsModule = typeof import("@generated/prisma/enums");
type HelpersModule =
  typeof import("@/shared/lib/validations/enums/refund-attribution");

let prisma: PrismaModule["prisma"];
let refundReservationPaymentCommand: PaymentCommandsModule["refundReservationPaymentCommand"];
let PaymentStatus: PrismaEnumsModule["PaymentStatus"];
let REFUNDED_BY_TYPE: HelpersModule["REFUNDED_BY_TYPE"];

type ReservationFixture = {
  reservationId: string;
  cleanup: () => Promise<void>;
};

let nextFixtureSortOrder = Math.floor(Date.now() / 1000);
const TAX_RATE_PERCENT = 10;
const TOTAL_WITH_TAX = 5000;

async function createPaidReservationFixture(): Promise<ReservationFixture> {
  const suffix = crypto.randomUUID();

  const location = await prisma.location.create({
    data: {
      slug: `refund-retry-loc-${suffix}`,
      name: `Refund Retry Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
      sortOrder: nextFixtureSortOrder++,
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `refund-retry-space-${suffix}`,
      name: `Refund Retry Space ${suffix}`,
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
      email: `refund-retry-${suffix}@example.com`,
      emailCanonical: `refund-retry-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const basePrice = Math.round(
    (TOTAL_WITH_TAX * 100) / (100 + TAX_RATE_PERCENT),
  );
  const taxAmount = Math.round((basePrice * TAX_RATE_PERCENT) / 100);
  if (basePrice + taxAmount !== TOTAL_WITH_TAX) {
    throw new Error(
      `税込 ${TOTAL_WITH_TAX} 円は税抜からの導出で再現できない（${basePrice} + ${taxAmount}）`,
    );
  }

  const reservation = await prisma.reservation.create({
    data: {
      customerId: customer.id,
      spaceId: space.id,
      startTime: new Date("2027-04-01T09:00:00+09:00"),
      endTime: new Date("2027-04-01T11:00:00+09:00"),
      status: "CONFIRMED",
      totalPrice: basePrice,
      basePrice,
      rateBreakdownJson: {
        schemaVersion: 1,
        segments: [],
        totalHours: 0,
        totalBasePrice: 0,
        holidayFlags: {},
      },
      taxRateType: "STANDARD",
      taxRate: TAX_RATE_PERCENT,
      taxAmount,
      totalPriceWithTax: TOTAL_WITH_TAX,
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: `pi_retry_${suffix}`,
    },
    select: { id: true },
  });

  return {
    reservationId: reservation.id,
    cleanup: async () => {
      await deleteRefundsForTest(prisma, { reservationId: reservation.id });
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

describeMaybe(
  "refundReservationPaymentCommand — failed 後の同額再試行は別 idempotency key",
  () => {
    beforeAll(async () => {
      ({ prisma } = await import("@/shared/db/prisma"));
      ({ refundReservationPaymentCommand } =
        await import("@/shared/domain/reservations/payment-commands"));
      ({ PaymentStatus } = await import("@generated/prisma/enums"));
      ({ REFUNDED_BY_TYPE } =
        await import("@/shared/lib/validations/enums/refund-attribution"));
      await prisma.$queryRaw`SELECT 1`;
    });

    afterAll(async () => {
      await prisma.$disconnect();
    });

    beforeEach(() => {
      mockRefundsCreate.mockReset();
      mockCreateAuditLogRecord.mockReset();
      mockCreateAuditLogRecord.mockImplementation(() => Promise.resolve());
    });

    test("初回 Stripe refund が failed のあと、同額再試行のキー末尾は excludedAttemptCount=1", async () => {
      const { reservationId, cleanup } = await createPaidReservationFixture();
      try {
        mockRefundsCreate.mockImplementationOnce(() =>
          Promise.resolve({
            id: `re_failed_${crypto.randomUUID()}`,
            status: "failed",
          }),
        );
        mockRefundsCreate.mockImplementationOnce(() =>
          Promise.resolve({
            id: `re_retry_${crypto.randomUUID()}`,
            status: "succeeded",
          }),
        );

        await refundReservationPaymentCommand({
          reservationId,
          actorType: REFUNDED_BY_TYPE.ADMIN,
          actorUserId: "admin-user-id",
        });

        const afterFailed = await prisma.refund.findMany({
          where: { reservationId },
        });
        expect(afterFailed).toHaveLength(1);
        expect(definite(afterFailed[0], "afterFailed[0]").status).toBe(
          "failed",
        );

        const firstKey = (
          nthCall(mockRefundsCreate, 0, "mockRefundsCreate")[1] as
            { idempotencyKey?: string } | undefined
        )?.idempotencyKey;
        expect(firstKey).toBe(
          `reservation-refund-${reservationId}-${TOTAL_WITH_TAX}-0`,
        );

        const retry = await refundReservationPaymentCommand({
          reservationId,
          actorType: REFUNDED_BY_TYPE.ADMIN,
          actorUserId: "admin-user-id",
        });
        expect(retry.refundAmount).toBe(TOTAL_WITH_TAX);
        expect(retry.isSettled).toBe(true);

        const secondKey = (
          nthCall(mockRefundsCreate, 1, "mockRefundsCreate")[1] as
            { idempotencyKey?: string } | undefined
        )?.idempotencyKey;
        expect(secondKey).toBe(
          `reservation-refund-${reservationId}-${TOTAL_WITH_TAX}-1`,
        );
        expect(secondKey).not.toBe(firstKey);

        const refunds = await prisma.refund.findMany({
          where: { reservationId },
          orderBy: { createdAt: "asc" },
        });
        expect(refunds).toHaveLength(2);
        expect(definite(refunds[1], "refunds[1]").status).toBe("succeeded");
      } finally {
        await cleanup();
      }
    }, 30_000);
  },
);
