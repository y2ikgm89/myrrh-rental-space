/**
 * recordManualEventPaymentCommand の UNPAID → PAID 遷移を実DBで検証する。
 * claimEventRegistrationAsPaid と同じ updateMany WHERE claim パターンで実装する。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { EventScheduleMode, EventStatus } from "@generated/prisma/enums";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  const url = new URL(TEST_DB_URL);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", "20");
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", "60");
  }
  process.env["DATABASE_URL"] = url.toString();
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type PaymentCommandsModule =
  typeof import("@/shared/domain/events/payment-commands");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let recordManualEventPaymentCommand: PaymentCommandsModule["recordManualEventPaymentCommand"];

describeMaybe("recordManualEventPaymentCommand", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ recordManualEventPaymentCommand } =
      await import("@/shared/domain/events/payment-commands"));
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("UNPAID の登録を PAID にし、金額を記録する", async () => {
    const suffix = crypto.randomUUID();
    const start = new Date("2026-08-01T10:00:00.000Z");
    const end = new Date("2026-08-01T12:00:00.000Z");

    const fixture = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          title: `手動入金テスト ${suffix}`,
          slug: `manual-payment-${suffix}`,
          status: EventStatus.PUBLISHED,
          descriptionJson: { type: "doc" },
          descriptionHtml: "<p>test</p>",
          descriptionPlainText: "test",
          scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
          registrationOpen: true,
          firstSlotStartAt: start,
          lastSlotEndAt: end,
        },
        select: { id: true },
      });

      const slot = await tx.eventTimeSlot.create({
        data: { eventId: event.id, startAt: start, endAt: end, capacity: 10 },
        select: { id: true },
      });

      const ticket = await tx.eventTicket.create({
        data: {
          eventId: event.id,
          name: "有料",
          price: 1000,
          isAvailable: true,
        },
        select: { id: true },
      });

      const registration = await tx.eventRegistration.create({
        data: {
          eventId: event.id,
          slotId: slot.id,
          ticketId: ticket.id,
          name: "手動入金太郎",
          quantity: 1,
          paymentStatus: "UNPAID" as never,
          stripeCheckoutSessionId: null,
        },
        select: { id: true },
      });

      return { eventId: event.id, registrationId: registration.id };
    });

    try {
      const result = await recordManualEventPaymentCommand({
        registrationId: fixture.registrationId,
        amount: 1000,
      });
      expect(result.registrationId).toBe(fixture.registrationId);

      const updated = await prisma.eventRegistration.findUniqueOrThrow({
        where: { id: fixture.registrationId },
      });
      expect(updated.paymentStatus).toBe("PAID");
      expect(updated.paidAmount).toBe(1000);
      expect(updated.paidAt).not.toBeNull();
    } finally {
      // Cleanup
      await prisma.eventRegistration.deleteMany({
        where: { eventId: fixture.eventId },
      });
      await prisma.eventTicket.deleteMany({
        where: { eventId: fixture.eventId },
      });
      await prisma.event.delete({ where: { id: fixture.eventId } });
    }
  });
});
