/**
 * expireAndPromoteWaitlistForEventCommand の session lock (728354) leak 実 DB 回帰テスト。
 *
 * 修正前は candidate ループ内のエラーが savepoint なしで tx を直接 abort させて
 * いたため、Postgres がトランザクションを aborted 状態にし、finally 内の
 * `releaseWaitlistPromoteSessionLock` も同じトランザクションで実行しようとして
 * 25P02 (current transaction is aborted) で失敗していた。session lock は
 * commit/rollback で自動解放されないため、release が失敗すると物理コネクションが
 * pool に返却されるまでその event の waitlist promote が止まっていた。
 *
 * 修正後は 1 candidate の処理を savepoint（ネスト `$transaction`）に隔離し、
 * 失敗しても外側 tx は健全なまま継続 → release が正常に実行される。
 *
 * `EventRegistration.id/slotId/ticketId` は uuid（ID 形式は統一済み。以前は
 * ない）で、不正な型を渡しても Postgres は単に「一致なし」を返すだけで例外を
 * 投げないため（実測確認済み）、現実的な入力データだけで candidate 処理中の
 * DB エラーを再現することはできない。そのためこのテストは2部構成:
 *   1. 実関数の正常系（healthy candidate の expire + FIFO promote）の回帰ガード
 *   2. 修正が依拠する「ネスト $transaction 失敗後も session lock は release
 *      される」というメカニズム自体を、実際のロック関数 + 本物の SQL エラー
 *      （`SELECT 1/0`）で直接検証する
 *
 * **実測上の注意（このテスト設計で踏んだ罠）**: leak 検知に
 * `pg_try_advisory_lock` の再取得可否は使えない。advisory lock は session
 * （= 物理コネクション）単位で reentrant なため、Prisma の pool が「リークした
 * のと同じコネクション」を次のクエリに再利用すると、そのセッション自身は
 * 自分が既に持つロックの再取得に常に成功し、leak を見逃す（実測で偽陰性を
 * 確認済み）。確実な検証は `pg_locks` システムビューを直接見る。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
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
let tryAcquireWaitlistPromoteSessionLock: WaitlistLocksModule["tryAcquireWaitlistPromoteSessionLock"];
let releaseWaitlistPromoteSessionLock: WaitlistLocksModule["releaseWaitlistPromoteSessionLock"];
let testCategoryId: string;

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
  "expireAndPromoteWaitlistForEventCommand の session lock leak 防止",
  () => {
    beforeAll(async () => {
      ({ prisma } = await import("@/shared/db/prisma"));
      ({ expireAndPromoteWaitlistForEventCommand } =
        await import("@/shared/domain/events/waitlist-offer-commands"));
      ({
        tryAcquireWaitlistPromoteSessionLock,
        releaseWaitlistPromoteSessionLock,
      } = await import("@/shared/domain/events/waitlist-locks"));
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

    test("正常系: 期限切れ WAITLISTED_OFFERED を EXPIRED にし、session lock は release される", async () => {
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

        const heldLocks = await prisma.$queryRaw<
          readonly { readonly granted: boolean }[]
        >`
          SELECT granted FROM pg_locks
          WHERE locktype = 'advisory'
            AND classid = 728354
            AND objid = hashtext(${eventId})::int
        `;
        expect(heldLocks).toEqual([]);
      } finally {
        await prisma.eventRegistration.deleteMany({ where: { eventId } });
        await prisma.event.deleteMany({ where: { id: eventId } });
      }
    }, 30_000);

    test("メカニズム: ネスト $transaction 内の本物の SQL エラーは savepoint で吸収され、外側 tx はそのまま session lock を release できる", async () => {
      const eventId = `mechanism-${crypto.randomUUID()}`;
      let candidateErrorCaught = false;

      await prisma.$transaction(async (tx) => {
        const acquired = await tryAcquireWaitlistPromoteSessionLock(
          tx,
          eventId,
        );
        expect(acquired).toBe(true);

        try {
          // 修正後の実装と同じ形: 1 candidate 相当の処理をネスト $transaction
          // （savepoint）に隔離する。JS の throw ではなく `SELECT 1/0`
          // （division by zero, 22012）で本物の Postgres エラーを起こす —
          // JS throw だけでは Postgres 側の transaction は abort しない
          // （実測確認済み。aborted 状態を作れるのは実際に失敗した SQL 文のみ）。
          try {
            await tx.$transaction(async (tx2) => {
              await tx2.$queryRaw`SELECT 1/0`;
            });
          } catch {
            candidateErrorCaught = true;
          }

          // savepoint rollback 後も外側 tx が健全であることの直接証拠:
          // 同じ tx で追加のクエリが正常に実行できる（aborted なら 25P02 で落ちる）。
          const stillHealthy = await tx.$queryRaw<
            readonly { readonly ok: number }[]
          >`SELECT 1 AS ok`;
          expect(stillHealthy[0]?.ok).toBe(1);
        } finally {
          await releaseWaitlistPromoteSessionLock(tx, eventId);
        }
      });

      expect(candidateErrorCaught).toBe(true);

      // 本体の主張: pg_locks を直接見て leak していないことを確認する。
      // `pg_try_advisory_lock` の再取得可否は session-reentrant のため使えない
      // （pool が同一物理コネクションを再利用すると偽陰性になる。実測確認済み）。
      const heldLocks = await prisma.$queryRaw<
        readonly { readonly granted: boolean }[]
      >`
        SELECT granted FROM pg_locks
        WHERE locktype = 'advisory'
          AND classid = 728354
          AND objid = hashtext(${eventId})::int
      `;
      expect(heldLocks).toEqual([]);
    });
  },
);
