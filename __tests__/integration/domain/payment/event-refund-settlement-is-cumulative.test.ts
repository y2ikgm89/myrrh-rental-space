/**
 * イベント申込の返金確定が「累積額」で REFUNDED / PARTIALLY_REFUNDED を決める。
 *
 * 予約側の正本は auto-refund-settlement-is-cumulative。こちらは
 * finalizeSettledEventRegistrationRefund の実 DB 正本。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import {
  EventScheduleMode,
  EventStatus,
  PaymentStatus,
} from "@generated/prisma/enums";

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
type PaymentQueriesModule =
  typeof import("@/shared/domain/events/payment-queries");

let prisma: PrismaModule["prisma"];
let finalizeSettledEventRegistrationRefund: PaymentQueriesModule["finalizeSettledEventRegistrationRefund"];

const PAID_AMOUNT = 10000;

type SharedEvent = {
  eventId: string;
  slotId: string;
  ticketId: string;
};

let testCategoryId: string;
let sharedEvent: SharedEvent;
const createdRegistrationIds: string[] = [];

async function createSharedEvent(): Promise<SharedEvent> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: `Event Refund Settle ${suffix}`,
        slug: `event-refund-settle-${suffix}`,
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

async function createPaidRegistrationWithPendingRefund(input: {
  refundAmount: number;
}): Promise<{ registrationId: string; stripeRefundId: string }> {
  const suffix = crypto.randomUUID();
  const registration = await prisma.eventRegistration.create({
    data: {
      eventId: sharedEvent.eventId,
      slotId: sharedEvent.slotId,
      ticketId: sharedEvent.ticketId,
      name: "山田太郎",
      email: `event-refund-settle-${suffix}@example.com`,
      quantity: 1,
      paymentStatus: PaymentStatus.PAID,
      stripePaymentIntentId: `pi_${suffix.replaceAll("-", "")}`,
      paidAmount: PAID_AMOUNT,
    },
    select: { id: true },
  });
  createdRegistrationIds.push(registration.id);

  const stripeRefundId = `re_${suffix.replaceAll("-", "")}`;
  await prisma.refund.create({
    data: {
      eventRegistrationId: registration.id,
      stripeRefundId,
      amount: input.refundAmount,
      status: "pending",
      refundedByType: "AUTO_ON_CANCEL",
    },
  });

  return { registrationId: registration.id, stripeRefundId };
}

describeMaybe("イベント返金の確定は累積額で判定する", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ finalizeSettledEventRegistrationRefund } =
      await import("@/shared/domain/events/payment-queries"));
    await prisma.$queryRaw`SELECT 1`;

    const category = await prisma.eventCategory.create({
      data: {
        name: `Event Refund Settle Category ${crypto.randomUUID()}`,
        sortOrder: 22_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;
    sharedEvent = await createSharedEvent();
  });

  afterAll(async () => {
    await deleteRefundsForTest(prisma, {
      eventRegistrationId: { in: createdRegistrationIds },
    });
    await prisma.eventRegistration.deleteMany({
      where: { id: { in: createdRegistrationIds } },
    });
    await prisma.event.deleteMany({ where: { id: sharedEvent.eventId } });
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await prisma.$disconnect();
  });

  test("ポリシー按分の部分返金は PARTIALLY_REFUNDED で止まる", async () => {
    const partial = Math.floor(PAID_AMOUNT / 2);
    const { registrationId, stripeRefundId } =
      await createPaidRegistrationWithPendingRefund({ refundAmount: partial });

    const claimed = await finalizeSettledEventRegistrationRefund(
      registrationId,
      stripeRefundId,
      "AUTO_ON_CANCEL",
    );

    expect(claimed).toBe(true);
    const after = await prisma.eventRegistration.findUniqueOrThrow({
      where: { id: registrationId },
      select: { paymentStatus: true },
    });
    expect(after.paymentStatus).toBe(PaymentStatus.PARTIALLY_REFUNDED);
  });

  test("全額の自動返金は REFUNDED まで進む", async () => {
    const { registrationId, stripeRefundId } =
      await createPaidRegistrationWithPendingRefund({
        refundAmount: PAID_AMOUNT,
      });

    const claimed = await finalizeSettledEventRegistrationRefund(
      registrationId,
      stripeRefundId,
      "AUTO_ON_CANCEL",
    );

    expect(claimed).toBe(true);
    const after = await prisma.eventRegistration.findUniqueOrThrow({
      where: { id: registrationId },
      select: { paymentStatus: true },
    });
    expect(after.paymentStatus).toBe(PaymentStatus.REFUNDED);
  });

  test("部分返金を 2 回積んで総額に達したら REFUNDED", async () => {
    const half = Math.floor(PAID_AMOUNT / 2);
    const { registrationId, stripeRefundId } =
      await createPaidRegistrationWithPendingRefund({ refundAmount: half });

    await finalizeSettledEventRegistrationRefund(
      registrationId,
      stripeRefundId,
      "AUTO_ON_CANCEL",
    );

    const secondRefundId = `re_${crypto.randomUUID().replaceAll("-", "")}`;
    await prisma.refund.create({
      data: {
        eventRegistrationId: registrationId,
        stripeRefundId: secondRefundId,
        amount: PAID_AMOUNT - half,
        status: "pending",
        refundedByType: "ADMIN",
      },
    });

    await finalizeSettledEventRegistrationRefund(
      registrationId,
      secondRefundId,
      "ADMIN",
    );

    const after = await prisma.eventRegistration.findUniqueOrThrow({
      where: { id: registrationId },
      select: { paymentStatus: true },
    });
    expect(after.paymentStatus).toBe(PaymentStatus.REFUNDED);
  });
});
