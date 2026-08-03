/**
 * 申込済みチケットの削除ガードの統合テスト（実 DB 必須）。
 *
 * **このテストが守る不変条件**:
 *   申込 (`EventRegistration`) が紐づくチケットは削除できず、拒否は `DomainError` で返る。
 *
 * `event_registrations.ticketId` は `onDelete: RESTRICT` なので、ガードが無くても
 * データは壊れない。壊れるのは**エラーの出かた**で、Prisma が P2003 を投げ、これは
 * `DomainError` ではないため `executeAdminMutationResult` の変換に乗らず、管理画面に
 * 生の Prisma エラーが出る。同型の EventTimeSlot 削除（slot-commands.ts）は
 * 「申込済みのスロットは削除できません」を事前に返しており、チケット側だけが
 * 取り残されていた。
 *
 * == 実行条件 ==
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。
 * TEST_DATABASE_URL 未設定時は describe.skip で silent skip。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  EventScheduleMode,
  EventStatus,
  PaymentStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type SyncModule =
  typeof import("@/shared/domain/events/event-slot-sync-commands");

let prisma: PrismaModule["prisma"];
let syncEventTicketsCommand: SyncModule["syncEventTicketsCommand"];
let categoryId: string;

let nextSort = 1_900_000_000;

type Fixture = {
  eventId: string;
  slotId: string;
  keptTicketId: string;
  bookedTicketId: string;
  registrationId: string;
  cleanup: () => Promise<void>;
};

async function createFixture(): Promise<Fixture> {
  const suffix = crypto.randomUUID().replace(/-/gu, "").slice(0, 12);
  const slotStart = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // SINGLE_OCCURRENCE は commit 時に「slot ちょうど 1 件」を要求する constraint
  // trigger があるため、event / slot / ticket / registration を単一 tx で作る。
  const created = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        slug: `ticket-guard-${suffix}`,
        title: `Ticket Guard ${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        status: EventStatus.PUBLISHED,
        thumbnailUrl: "https://example.test/e.jpg",
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        categoryId,
      },
      select: { id: true },
    });
    const slot = await tx.eventTimeSlot.create({
      data: {
        eventId: event.id,
        startAt: slotStart,
        endAt: new Date(slotStart.getTime() + 60 * 60 * 1000),
        capacity: 10,
      },
      select: { id: true },
    });
    const booked = await tx.eventTicket.create({
      data: {
        eventId: event.id,
        name: `Booked ${suffix}`,
        price: 1000,
        capacity: 10,
        sortOrder: nextSort++,
      },
      select: { id: true },
    });
    const kept = await tx.eventTicket.create({
      data: {
        eventId: event.id,
        name: `Kept ${suffix}`,
        price: 2000,
        capacity: 10,
        sortOrder: nextSort++,
      },
      select: { id: true },
    });
    const registration = await tx.eventRegistration.create({
      data: {
        eventId: event.id,
        slotId: slot.id,
        ticketId: booked.id,
        name: `Guest ${suffix}`,
        email: `ticket-guard-${suffix}@example.test`,
        quantity: 1,
        status: RegistrationStatus.CONFIRMED,
        paymentStatus: PaymentStatus.UNPAID,
      },
      select: { id: true },
    });
    return {
      eventId: event.id,
      slotId: slot.id,
      keptTicketId: kept.id,
      bookedTicketId: booked.id,
      registrationId: registration.id,
    };
  });

  return {
    ...created,
    cleanup: async () => {
      await prisma.eventRegistration.deleteMany({
        where: { id: created.registrationId },
      });
      await prisma.eventTicket.deleteMany({
        where: { eventId: created.eventId },
      });
      await prisma.$transaction(async (tx) => {
        await tx.eventTimeSlot.deleteMany({ where: { id: created.slotId } });
        await tx.event.deleteMany({ where: { id: created.eventId } });
      });
    },
  };
}

describeMaybe("チケット削除ガード", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ syncEventTicketsCommand } =
      await import("@/shared/domain/events/event-slot-sync-commands"));
    await prisma.$queryRaw`SELECT 1`;

    const category = await prisma.eventCategory.create({
      data: {
        name: `Ticket Guard Category ${crypto.randomUUID()}`,
        sortOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.eventCategory.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  test("申込のあるチケットを外そうとすると DomainError で拒否される", async () => {
    const fixture = await createFixture();
    try {
      let message: string | null = null;
      let code: string | null = null;
      try {
        // incoming から booked を落とす = 削除要求
        await prisma.$transaction(async (tx) => {
          await syncEventTicketsCommand(tx, fixture.eventId, [
            {
              id: fixture.keptTicketId,
              name: "Kept",
              description: null,
              price: 2000,
              capacity: 10,
              unitSize: 1,
              isAvailable: true,
            },
          ]);
        });
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
        code =
          error !== null &&
          typeof error === "object" &&
          "code" in error &&
          typeof error.code === "string"
            ? error.code
            : null;
      }

      // 生の Prisma エラー（P2003）ではなく DomainError であること
      expect(message).toBe("申込済みのチケットは削除できません");
      expect(code).toBe("VALIDATION");

      // 拒否された以上、チケットは 2 枚とも残っている
      const remaining = await prisma.eventTicket.count({
        where: { eventId: fixture.eventId },
      });
      expect(remaining).toBe(2);
    } finally {
      await fixture.cleanup();
    }
  });

  test("申込の無いチケットは従来どおり削除できる", async () => {
    const fixture = await createFixture();
    try {
      await prisma.$transaction(async (tx) => {
        // booked は残し、申込の無い kept を外す
        await syncEventTicketsCommand(tx, fixture.eventId, [
          {
            id: fixture.bookedTicketId,
            name: "Booked",
            description: null,
            price: 1000,
            capacity: 10,
            unitSize: 1,
            isAvailable: true,
          },
        ]);
      });

      const remaining = await prisma.eventTicket.findMany({
        where: { eventId: fixture.eventId },
        select: { id: true },
      });
      expect(remaining.map((t) => t.id)).toEqual([fixture.bookedTicketId]);
    } finally {
      await fixture.cleanup();
    }
  });
});
