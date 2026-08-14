/**
 * `applyEventChargeRefundIdempotent` を実 DB で走らせる。
 *
 * Reservation 側は `charge-refunded-settlement.test.ts` があるが、event 側
 * webhook wrapper はこれまで 0 本だった。`events/refund-command.test.ts` は
 * アプリ発の返金コマンドであり、この wrapper は通らない。
 *
 * Stripe は叩かない（charge.refunded 反映は既に Stripe 側が完了したあと）。
 * AuditLog だけ mock する（hash-chain が共有 test-db を汚染するため）。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { EventScheduleMode, EventStatus } from "@generated/prisma/enums";
import { deleteRefundsForTest } from "../../../helpers/refund-test-cleanup";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

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
  typeof import("@/shared/domain/events/payment-queries");
type EnumsModule = typeof import("@generated/prisma/enums");

let prisma: PrismaModule["prisma"];
let applyEventChargeRefundIdempotent: PaymentQueriesModule["applyEventChargeRefundIdempotent"];
let PaymentStatus: EnumsModule["PaymentStatus"];

const PAID_AMOUNT = 5000;

type RegistrationFixture = {
  registrationId: string;
  cleanup: () => Promise<void>;
};

let testCategoryId: string;
let sharedEvent: { eventId: string; slotId: string; ticketId: string };

async function createSharedEvent() {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: `Charge Refund Event ${suffix}`,
        slug: `charge-refund-event-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        status: EventStatus.PUBLISHED,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        firstSlotStartAt: start,
        lastSlotEndAt: end,
        categoryId: testCategoryId,
      },
      select: { id: true },
    });

    const slot = await tx.eventTimeSlot.create({
      data: {
        eventId: event.id,
        startAt: start,
        endAt: end,
        capacity: 1000,
      },
      select: { id: true },
    });

    const ticket = await tx.eventTicket.create({
      data: {
        eventId: event.id,
        name: "一般",
        price: PAID_AMOUNT,
        capacity: null,
        isAvailable: true,
      },
      select: { id: true },
    });

    return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
  });
}

async function createPaidRegistration(): Promise<RegistrationFixture> {
  const suffix = crypto.randomUUID();
  const registration = await prisma.eventRegistration.create({
    data: {
      eventId: sharedEvent.eventId,
      slotId: sharedEvent.slotId,
      ticketId: sharedEvent.ticketId,
      name: "山田太郎",
      email: `event-charge-refund-${suffix}@example.com`,
      quantity: 1,
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: `pi_event_charge_refund_${suffix}`,
      paidAmount: PAID_AMOUNT,
    },
    select: { id: true },
  });

  return {
    registrationId: registration.id,
    cleanup: async () => {
      await deleteRefundsForTest(prisma, {
        eventRegistrationId: registration.id,
      });
      await prisma.eventRegistration.deleteMany({
        where: { id: registration.id },
      });
    },
  };
}

async function refundRowsOf(registrationId: string) {
  return prisma.refund.findMany({
    where: { eventRegistrationId: registrationId },
    select: { amount: true, stripeRefundId: true, status: true },
    orderBy: { createdAt: "asc" },
  });
}

async function paymentStatusOf(registrationId: string): Promise<string> {
  const row = await prisma.eventRegistration.findUniqueOrThrow({
    where: { id: registrationId },
    select: { paymentStatus: true },
  });
  return row.paymentStatus;
}

describeMaybe("event charge.refunded は実 DB に Refund 行を書く", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ applyEventChargeRefundIdempotent } =
      await import("@/shared/domain/events/payment-queries"));
    ({ PaymentStatus } = await import("@generated/prisma/enums"));
    await prisma.$queryRaw`SELECT 1`;

    const category = await prisma.eventCategory.create({
      data: {
        name: `Charge Refund Event Category ${crypto.randomUUID()}`,
        sortOrder: 20_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;
    sharedEvent = await createSharedEvent();
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { id: sharedEvent.eventId } });
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await prisma.$disconnect();
  });

  test("JPY の整数返金は Refund 行を書き REFUNDED まで進める", async () => {
    const { registrationId, cleanup } = await createPaidRegistration();
    const stripeRefundId = `re_event_jpy_${crypto.randomUUID()}`;

    try {
      await applyEventChargeRefundIdempotent({
        registrationId,
        chargeAmount: PAID_AMOUNT,
        amountRefunded: PAID_AMOUNT,
        currency: "jpy",
        latestRefund: {
          id: stripeRefundId,
          amount: PAID_AMOUNT,
          status: "succeeded",
          metadata: null,
        },
      });

      expect(await refundRowsOf(registrationId)).toEqual([
        { amount: PAID_AMOUNT, stripeRefundId, status: "succeeded" },
      ]);
      expect(await paymentStatusOf(registrationId)).toBe(
        PaymentStatus.REFUNDED,
      );
    } finally {
      await cleanup();
    }
  });

  test("USD 1250 cents は float を書かず throw もしない (CRITICAL)", async () => {
    const { registrationId, cleanup } = await createPaidRegistration();
    const stripeRefundId = `re_event_usd_${crypto.randomUUID()}`;
    mockLogError.mockClear();
    mockCreateNotificationCommand.mockClear();

    try {
      await applyEventChargeRefundIdempotent({
        registrationId,
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

      expect(await refundRowsOf(registrationId)).toEqual([]);
      expect(await paymentStatusOf(registrationId)).toBe(PaymentStatus.PAID);
      expect(mockLogError).toHaveBeenCalledWith(
        expect.objectContaining({ name: "NonIntegerAppAmountError" }),
        expect.objectContaining({ severity: "CRITICAL" }),
      );
    } finally {
      await cleanup();
    }
  });
});
