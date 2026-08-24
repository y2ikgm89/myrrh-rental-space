/**
 * 空いている席の数だけキャンセル待ちが繰り上がることの検査（実 Postgres）。
 *
 * ## なぜ実 DB でやるのか
 *
 * 空き席の計算は `capacity - CONFIRMED の quantity 合計 -
 * WAITLISTED_OFFERED の quantity 合計` で、集計 3 本と定員 2 種（スロット /
 * チケット）の相互作用が本体。mock では「引数の形」しか固定できず、
 * 数え間違いも FIFO の打ち切りも捕まらない。
 *
 * ## 何を固定するか
 *
 * 1. `quantity: 3` の申込がキャンセルされたら **3 席ぶん**繰り上がる
 *    （従来は 1 件だけ offer し、残り 2 席は誰にも案内されなかった）
 * 2. 未処理の `WAITLISTED_OFFERED` は席を押さえる（**二重に案内しない**）。
 *    DB の定員トリガーは `CONFIRMED` しか数えないので、ここを差し引かないと
 *    全員が確定した瞬間に最後の 1 人が弾かれる
 * 3. 先頭の `quantity` が残り空席を超えたら**飛ばさず止める**（FIFO の公平性）
 * 4. 空きが無ければ 1 件も offer しない
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（`bun run test:integration` が docker-compose の
 * test-db 既定値を注入する）。gateway は import 時の `process.env.DATABASE_URL` を
 * 読むため動的 import より前に上書きする。
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
type CommandsModule =
  typeof import("@/shared/domain/events/waitlist-offer-commands");

let prisma: PrismaModule["prisma"];
let offerWaitlistUpToCapacityForEventCommand: CommandsModule["offerWaitlistUpToCapacityForEventCommand"];

const NOW = new Date("2027-03-01T00:00:00.000Z");

describeMaybe("キャンセル待ちの空き容量 backfill — 実 Postgres", () => {
  const eventIds: string[] = [];
  let categoryId: string;

  async function createEvent(
    label: string,
    slotCapacity: number,
    ticketCapacity: number | null,
  ): Promise<{ eventId: string; slotId: string; ticketId: string }> {
    const suffix = crypto.randomUUID();
    const start = new Date("2027-04-01T01:00:00.000Z");
    const end = new Date("2027-04-01T03:00:00.000Z");
    const created = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          title: `Waitlist backfill ${label}`,
          slug: `waitlist-backfill-${label}-${suffix}`,
          descriptionJson: { type: "doc" },
          descriptionHtml: "<p>test</p>",
          descriptionPlainText: "test",
          status: EventStatus.PUBLISHED,
          scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
          registrationOpen: true,
          firstSlotStartAt: start,
          lastSlotEndAt: end,
          categoryId,
        },
        select: { id: true },
      });
      const slot = await tx.eventTimeSlot.create({
        data: {
          eventId: event.id,
          startAt: start,
          endAt: end,
          capacity: slotCapacity,
        },
        select: { id: true },
      });
      const ticket = await tx.eventTicket.create({
        data: {
          eventId: event.id,
          name: "一般",
          price: 0,
          capacity: ticketCapacity,
          isAvailable: true,
        },
        select: { id: true },
      });
      return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
    });
    eventIds.push(created.eventId);
    return created;
  }

  async function addRegistration(
    base: { eventId: string; slotId: string; ticketId: string },
    input: {
      name: string;
      status: RegistrationStatus;
      quantity: number;
      waitlistedAt?: Date;
      expiresAt?: Date;
    },
  ): Promise<string> {
    const row = await prisma.eventRegistration.create({
      data: {
        eventId: base.eventId,
        slotId: base.slotId,
        ticketId: base.ticketId,
        name: input.name,
        email: `${input.name}-${crypto.randomUUID()}@example.com`,
        quantity: input.quantity,
        status: input.status,
        ...(input.waitlistedAt ? { waitlistedAt: input.waitlistedAt } : {}),
        ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
      },
      select: { id: true },
    });
    return row.id;
  }

  async function statusOf(id: string): Promise<RegistrationStatus> {
    const row = await prisma.eventRegistration.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    return row.status;
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ offerWaitlistUpToCapacityForEventCommand } =
      await import("@/shared/domain/events/waitlist-offer-commands"));
    await prisma.$queryRaw`SELECT 1`;
    const category = await prisma.eventCategory.create({
      data: {
        name: `Waitlist backfill category ${crypto.randomUUID()}`,
        sortOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.eventRegistration.deleteMany({
      where: { eventId: { in: eventIds } },
    });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.eventCategory.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  test("空いた 3 席に 3 人まとめて繰り上がる", async () => {
    // 定員 10、CONFIRMED 7 → 3 席空き。従来は 1 件しか offer されなかった。
    const base = await createEvent("three-seats", 10, null);
    await addRegistration(base, {
      name: "確定",
      status: RegistrationStatus.CONFIRMED,
      quantity: 7,
    });
    const first = await addRegistration(base, {
      name: "待機1",
      status: RegistrationStatus.WAITLISTED,
      quantity: 1,
      waitlistedAt: new Date("2027-02-01T00:00:00.000Z"),
    });
    const second = await addRegistration(base, {
      name: "待機2",
      status: RegistrationStatus.WAITLISTED,
      quantity: 1,
      waitlistedAt: new Date("2027-02-02T00:00:00.000Z"),
    });
    const third = await addRegistration(base, {
      name: "待機3",
      status: RegistrationStatus.WAITLISTED,
      quantity: 1,
      waitlistedAt: new Date("2027-02-03T00:00:00.000Z"),
    });
    const fourth = await addRegistration(base, {
      name: "待機4",
      status: RegistrationStatus.WAITLISTED,
      quantity: 1,
      waitlistedAt: new Date("2027-02-04T00:00:00.000Z"),
    });

    const result = await offerWaitlistUpToCapacityForEventCommand({
      eventId: base.eventId,
      groups: [{ slotId: base.slotId, ticketId: base.ticketId }],
      now: NOW,
    });

    expect(result.offered.map(({ id }) => id)).toEqual([first, second, third]);
    expect(await statusOf(fourth)).toBe(RegistrationStatus.WAITLISTED);

    // 2 回目は空きが無い（offer が席を押さえている）ので 0 件。
    const again = await offerWaitlistUpToCapacityForEventCommand({
      eventId: base.eventId,
      groups: [{ slotId: base.slotId, ticketId: base.ticketId }],
      now: NOW,
    });
    expect(again.offered).toEqual([]);
  });

  test("未処理の offer は席を押さえる（同じ席を二重に案内しない）", async () => {
    // 定員 5、CONFIRMED 3、OFFERED 2 → 空き 0。
    // 定員トリガーは CONFIRMED しか数えないので、OFFERED を引かないと
    // 「空き 2」と誤認して二重に案内してしまう。
    const base = await createEvent("held-by-offer", 5, null);
    await addRegistration(base, {
      name: "確定",
      status: RegistrationStatus.CONFIRMED,
      quantity: 3,
    });
    await addRegistration(base, {
      name: "案内中",
      status: RegistrationStatus.WAITLISTED_OFFERED,
      quantity: 2,
      expiresAt: new Date("2027-03-02T00:00:00.000Z"),
    });
    const waiting = await addRegistration(base, {
      name: "待機",
      status: RegistrationStatus.WAITLISTED,
      quantity: 1,
      waitlistedAt: new Date("2027-02-01T00:00:00.000Z"),
    });

    const result = await offerWaitlistUpToCapacityForEventCommand({
      eventId: base.eventId,
      groups: [{ slotId: base.slotId, ticketId: base.ticketId }],
      now: NOW,
    });

    expect(result.offered).toEqual([]);
    expect(await statusOf(waiting)).toBe(RegistrationStatus.WAITLISTED);
  });

  test("先頭の数量が空席を超えたら飛ばさず止める（FIFO の公平性）", async () => {
    // 定員 10、CONFIRMED 8 → 2 席空き。先頭は 5 人で収まらない。
    // 後ろの 1 人を先に案内すると「順番にご案内しています」が嘘になる。
    const base = await createEvent("fifo-stop", 10, null);
    await addRegistration(base, {
      name: "確定",
      status: RegistrationStatus.CONFIRMED,
      quantity: 8,
    });
    const bigParty = await addRegistration(base, {
      name: "大人数",
      status: RegistrationStatus.WAITLISTED,
      quantity: 5,
      waitlistedAt: new Date("2027-02-01T00:00:00.000Z"),
    });
    const smallParty = await addRegistration(base, {
      name: "少人数",
      status: RegistrationStatus.WAITLISTED,
      quantity: 1,
      waitlistedAt: new Date("2027-02-02T00:00:00.000Z"),
    });

    const result = await offerWaitlistUpToCapacityForEventCommand({
      eventId: base.eventId,
      groups: [{ slotId: base.slotId, ticketId: base.ticketId }],
      now: NOW,
    });

    expect(result.offered).toEqual([]);
    expect(await statusOf(bigParty)).toBe(RegistrationStatus.WAITLISTED);
    expect(await statusOf(smallParty)).toBe(RegistrationStatus.WAITLISTED);
  });

  test("チケット定員のほうが小さければそちらで頭打ちになる", async () => {
    // スロット定員 20（空き 18）だがチケット定員 4（空き 2）。
    const base = await createEvent("ticket-capped", 20, 4);
    await addRegistration(base, {
      name: "確定",
      status: RegistrationStatus.CONFIRMED,
      quantity: 2,
    });
    const first = await addRegistration(base, {
      name: "待機1",
      status: RegistrationStatus.WAITLISTED,
      quantity: 1,
      waitlistedAt: new Date("2027-02-01T00:00:00.000Z"),
    });
    const second = await addRegistration(base, {
      name: "待機2",
      status: RegistrationStatus.WAITLISTED,
      quantity: 1,
      waitlistedAt: new Date("2027-02-02T00:00:00.000Z"),
    });
    const third = await addRegistration(base, {
      name: "待機3",
      status: RegistrationStatus.WAITLISTED,
      quantity: 1,
      waitlistedAt: new Date("2027-02-03T00:00:00.000Z"),
    });

    const result = await offerWaitlistUpToCapacityForEventCommand({
      eventId: base.eventId,
      groups: [{ slotId: base.slotId, ticketId: base.ticketId }],
      now: NOW,
    });

    expect(result.offered.map(({ id }) => id)).toEqual([first, second]);
    expect(await statusOf(third)).toBe(RegistrationStatus.WAITLISTED);
  });
});
