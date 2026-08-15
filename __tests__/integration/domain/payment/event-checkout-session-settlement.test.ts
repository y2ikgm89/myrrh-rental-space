/**
 * checkout.session.* の event-registration 書込本体を実 DB で走らせる。
 *
 * routing unit は domain を mock.module で差し替え、引数だけ見ていた。
 * AuditLog / notification は mock。Stripe は叩かない。
 */

import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { EventScheduleMode, EventStatus } from "@generated/prisma/enums";

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
  typeof import("@/shared/domain/events/payment-queries");
type EnumsModule = typeof import("@generated/prisma/enums");

let prisma: PrismaModule["prisma"];
let claimEventRegistrationAsPaid: PaymentQueriesModule["claimEventRegistrationAsPaid"];
let claimEventRegistrationAsFailed: PaymentQueriesModule["claimEventRegistrationAsFailed"];
let saveEventRegistrationPaymentIntentId: PaymentQueriesModule["saveEventRegistrationPaymentIntentId"];
let PaymentStatus: EnumsModule["PaymentStatus"];

const PAID_AMOUNT = 5000;

type RegistrationFixture = {
  registrationId: string;
  sessionId: string;
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
        title: `Event Checkout Settle ${suffix}`,
        slug: `event-checkout-settle-${suffix}`,
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

async function createRegistration(input?: {
  paymentStatus?: "UNPAID" | "PENDING" | "PAID";
  stripePaymentIntentId?: string | null;
}): Promise<RegistrationFixture> {
  const suffix = crypto.randomUUID();
  const sessionId = `cs_event_checkout_${suffix}`;
  const registration = await prisma.eventRegistration.create({
    data: {
      eventId: sharedEvent.eventId,
      slotId: sharedEvent.slotId,
      ticketId: sharedEvent.ticketId,
      name: "山田太郎",
      email: `event-checkout-settle-${suffix}@example.com`,
      quantity: 1,
      paymentStatus: input?.paymentStatus ?? PaymentStatus.UNPAID,
      stripeCheckoutSessionId: sessionId,
      stripePaymentIntentId: input?.stripePaymentIntentId ?? null,
      paidAmount: PAID_AMOUNT,
    },
    select: { id: true },
  });

  return {
    registrationId: registration.id,
    sessionId,
    cleanup: async () => {
      await prisma.eventRegistration.deleteMany({
        where: { id: registration.id },
      });
    },
  };
}

async function paymentRowOf(registrationId: string) {
  return prisma.eventRegistration.findUniqueOrThrow({
    where: { id: registrationId },
    select: {
      paymentStatus: true,
      stripePaymentIntentId: true,
      paidAt: true,
    },
  });
}

describeMaybe("event checkout.session は実 DB に payment 状態を書く", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({
      claimEventRegistrationAsPaid,
      claimEventRegistrationAsFailed,
      saveEventRegistrationPaymentIntentId,
    } = await import("@/shared/domain/events/payment-queries"));
    ({ PaymentStatus } = await import("@generated/prisma/enums"));
    await prisma.$queryRaw`SELECT 1`;

    const category = await prisma.eventCategory.create({
      data: {
        name: `Event Checkout Settle Category ${crypto.randomUUID()}`,
        sortOrder: 21_000_000 + Math.floor(Math.random() * 100_000_000),
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

  test("UNPAID を claim すると PAID と PaymentIntent を書く", async () => {
    const { registrationId, cleanup } = await createRegistration();
    const paymentIntentId = `pi_event_checkout_${crypto.randomUUID()}`;

    try {
      const claimed = await claimEventRegistrationAsPaid(registrationId, {
        stripePaymentIntentId: paymentIntentId,
      });
      const row = await paymentRowOf(registrationId);

      expect(claimed).toBe(true);
      expect(row.paymentStatus).toBe(PaymentStatus.PAID);
      expect(row.stripePaymentIntentId).toBe(paymentIntentId);
      expect(row.paidAt).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  test("既に PAID なら claim は false で行を上書きしない", async () => {
    const existingPi = `pi_event_already_${crypto.randomUUID()}`;
    const { registrationId, cleanup } = await createRegistration({
      paymentStatus: "PAID",
      stripePaymentIntentId: existingPi,
    });

    try {
      const claimed = await claimEventRegistrationAsPaid(registrationId, {
        stripePaymentIntentId: `pi_event_stale_${crypto.randomUUID()}`,
      });
      const row = await paymentRowOf(registrationId);

      expect(claimed).toBe(false);
      expect(row.paymentStatus).toBe(PaymentStatus.PAID);
      expect(row.stripePaymentIntentId).toBe(existingPi);
    } finally {
      await cleanup();
    }
  });

  test("PENDING への PI 保存は paymentStatus を動かさない", async () => {
    const { registrationId, cleanup } = await createRegistration({
      paymentStatus: "PENDING",
    });
    const paymentIntentId = `pi_event_async_${crypto.randomUUID()}`;

    try {
      await saveEventRegistrationPaymentIntentId(
        registrationId,
        paymentIntentId,
      );
      const row = await paymentRowOf(registrationId);

      expect(row.paymentStatus).toBe(PaymentStatus.PENDING);
      expect(row.stripePaymentIntentId).toBe(paymentIntentId);
    } finally {
      await cleanup();
    }
  });

  test("PAID への PI 保存は行を動かさない", async () => {
    const existingPi = `pi_event_paid_${crypto.randomUUID()}`;
    const { registrationId, cleanup } = await createRegistration({
      paymentStatus: "PAID",
      stripePaymentIntentId: existingPi,
    });

    try {
      await saveEventRegistrationPaymentIntentId(
        registrationId,
        `pi_event_overwrite_${crypto.randomUUID()}`,
      );
      const row = await paymentRowOf(registrationId);

      expect(row.paymentStatus).toBe(PaymentStatus.PAID);
      expect(row.stripePaymentIntentId).toBe(existingPi);
    } finally {
      await cleanup();
    }
  });

  test("session 一致の failed claim は FAILED を書く", async () => {
    const { registrationId, sessionId, cleanup } = await createRegistration({
      paymentStatus: "PENDING",
    });

    try {
      const claimed = await claimEventRegistrationAsFailed(
        registrationId,
        sessionId,
      );
      const row = await paymentRowOf(registrationId);

      expect(claimed).toBe(true);
      expect(row.paymentStatus).toBe(PaymentStatus.FAILED);
    } finally {
      await cleanup();
    }
  });

  test("session 不一致の failed claim は PENDING のまま", async () => {
    const { registrationId, cleanup } = await createRegistration({
      paymentStatus: "PENDING",
    });

    try {
      const claimed = await claimEventRegistrationAsFailed(
        registrationId,
        "cs_stale_event_session",
      );
      const row = await paymentRowOf(registrationId);

      expect(claimed).toBe(false);
      expect(row.paymentStatus).toBe(PaymentStatus.PENDING);
    } finally {
      await cleanup();
    }
  });

  test("既に PAID の failed claim は false で PAID を残す", async () => {
    const { registrationId, sessionId, cleanup } = await createRegistration({
      paymentStatus: "PAID",
      stripePaymentIntentId: `pi_event_paid_fail_${crypto.randomUUID()}`,
    });

    try {
      const claimed = await claimEventRegistrationAsFailed(
        registrationId,
        sessionId,
      );
      const row = await paymentRowOf(registrationId);

      expect(claimed).toBe(false);
      expect(row.paymentStatus).toBe(PaymentStatus.PAID);
    } finally {
      await cleanup();
    }
  });
});
