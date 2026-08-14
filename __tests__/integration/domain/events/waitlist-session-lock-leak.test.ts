/**
 * expireAndPromoteWaitlistForEventCommand の waitlist promote lock 実 DB 回帰テスト。
 *
 * かつて 728354 session lock を interactive tx の同一接続で acquire / release
 * していた。ITX timeout 後の finally release は P2028 で失敗し、session lock は
 * プール接続に残る。別接続の tryAcquire は false のまま、その event の promote
 * が止まる。
 *
 * 現行は DB row lease（`events.waitlist_promote_leased_until`）。acquire は
 * `UPDATE ... WHERE` で原子的。ITX が timeout / rollback すれば未コミットの
 * lease は消える。コミット済み stale lease は TTL で自己回復する。
 *
 * **閉じた印**: 外側 ITX timeout のあと、**別接続**の tryAcquire は true。
 * session lock 実装に戻すと false のまま赤になる。
 *
 * `EventRegistration.id/slotId/ticketId` は uuid で、不正な型を渡しても
 * Postgres は「一致なし」を返すだけなので、candidate 処理中の DB エラーは
 * `SELECT 1/0` で再現する。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@generated/prisma/client";
import {
  EventScheduleMode,
  EventStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type WaitlistOfferCommandsModule =
  typeof import("@/shared/domain/events/waitlist-offer-commands");
type WaitlistLocksModule =
  typeof import("@/shared/domain/events/waitlist-locks");

let prisma: PrismaModule["prisma"];
let expireAndPromoteWaitlistForEventCommand: WaitlistOfferCommandsModule["expireAndPromoteWaitlistForEventCommand"];
let tryAcquireWaitlistPromoteLease: WaitlistLocksModule["tryAcquireWaitlistPromoteLease"];
let releaseWaitlistPromoteLease: WaitlistLocksModule["releaseWaitlistPromoteLease"];
let testCategoryId: string;

function createOtherConnection(): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString: TEST_DB_URL }),
  });
}

async function createTestEvent(): Promise<{
  eventId: string;
  slotId: string;
  ticketId: string;
}> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 26 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: "Waitlist Session Lock Leak Test",
        slug: `waitlist-lock-leak-${suffix}`,
        descriptionJson: {},
        descriptionHtml: "",
        descriptionPlainText: "",
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
      data: { eventId: event.id, startAt: start, endAt: end, capacity: 1 },
      select: { id: true },
    });
    const ticket = await tx.eventTicket.create({
      data: { eventId: event.id, name: "一般", price: 0, isAvailable: true },
      select: { id: true },
    });
    return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
  });
}

describeMaybe(
  "expireAndPromoteWaitlistForEventCommand の waitlist promote lease",
  () => {
    beforeAll(async () => {
      ({ prisma } = await import("@/shared/db/prisma"));
      ({ expireAndPromoteWaitlistForEventCommand } =
        await import("@/shared/domain/events/waitlist-offer-commands"));
      ({ tryAcquireWaitlistPromoteLease, releaseWaitlistPromoteLease } =
        await import("@/shared/domain/events/waitlist-locks"));
      await prisma.$queryRaw`SELECT 1`;

      const category = await prisma.eventCategory.create({
        data: {
          name: `Waitlist Lock Leak Category ${crypto.randomUUID()}`,
          sortOrder: 50_000_000 + Math.floor(Math.random() * 100_000_000),
        },
        select: { id: true },
      });
      testCategoryId = category.id;
    });

    afterAll(async () => {
      await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
      await prisma.$disconnect();
    });

    test("正常系: 期限切れ WAITLISTED_OFFERED を EXPIRED にし、lease は release される", async () => {
      const { eventId, slotId, ticketId } = await createTestEvent();

      try {
        const now = new Date();
        const healthy = await prisma.eventRegistration.create({
          data: {
            eventId,
            slotId,
            ticketId,
            name: "正常 太郎",
            email: `healthy-${crypto.randomUUID()}@example.com`,
            quantity: 1,
            status: RegistrationStatus.WAITLISTED_OFFERED,
            offeredAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
            expiresAt: new Date(now.getTime() - 100),
          },
          select: { id: true },
        });

        const result = await expireAndPromoteWaitlistForEventCommand({
          eventId,
          candidates: [
            {
              id: healthy.id,
              slotId,
              ticketId,
              name: "正常 太郎",
              email: null,
            },
          ],
          now,
        });

        expect(result.expired.map((e) => e.id)).toEqual([healthy.id]);

        const healthyRow = await prisma.eventRegistration.findUniqueOrThrow({
          where: { id: healthy.id },
          select: { status: true },
        });
        expect(healthyRow.status).toBe(RegistrationStatus.EXPIRED);

        const reacquired = await tryAcquireWaitlistPromoteLease(
          prisma,
          eventId,
        );
        expect(reacquired).not.toBeNull();
        if (reacquired === null) return;
        await releaseWaitlistPromoteLease(prisma, eventId, reacquired);
      } finally {
        await prisma.eventRegistration.deleteMany({ where: { eventId } });
        await prisma.event.deleteMany({ where: { id: eventId } });
      }
    }, 30_000);

    test("メカニズム: ネスト $transaction 内の本物の SQL エラーは savepoint で吸収され、外側 tx はそのまま継続できる", async () => {
      let candidateErrorCaught = false;

      await prisma.$transaction(async (tx) => {
        try {
          await tx.$transaction(async (tx2) => {
            await tx2.$queryRaw`SELECT 1/0`;
          });
        } catch {
          candidateErrorCaught = true;
        }

        const stillHealthy = await tx.$queryRaw<
          readonly { readonly ok: number }[]
        >`SELECT 1 AS ok`;
        expect(stillHealthy[0]?.ok).toBe(1);
      });

      expect(candidateErrorCaught).toBe(true);
    });

    test("outer ITX timeout 後、別接続の tryAcquire は true", async () => {
      const { eventId } = await createTestEvent();
      // 共有 singleton は timeout 後に接続を破棄することがあり、session lock
      // leak を見逃す。専用クライアント 2 本で「別接続」を固定する。
      const holder = createOtherConnection();
      const other = createOtherConnection();

      try {
        await expect(
          holder.$transaction(
            async (tx) => {
              const acquired = await tryAcquireWaitlistPromoteLease(
                tx,
                eventId,
              );
              expect(acquired).not.toBeNull();
              await tx.$executeRaw`SELECT pg_sleep(2)`;
            },
            { timeout: 1000 },
          ),
        ).rejects.toThrow();

        const reacquired = await tryAcquireWaitlistPromoteLease(other, eventId);
        expect(reacquired).not.toBeNull();
        if (reacquired === null) return;
        await releaseWaitlistPromoteLease(other, eventId, reacquired);
      } finally {
        await holder.$disconnect();
        await other.$disconnect();
        await prisma.eventRegistration.deleteMany({ where: { eventId } });
        await prisma.event.deleteMany({ where: { id: eventId } });
      }
    }, 15_000);
  },
);
