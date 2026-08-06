/**
 * 定員を超えた確定申込を、**DB が受け付けない**ことを実 DB で確かめる。
 *
 * ## 何が守られていなかったか
 *
 * 定員まわりで DB が見ていたのは「値が 1 以上か」だけで、「確定申込の合計が定員を
 * 超えない」という不変条件は 1 本も無かった。実効的な保証はアプリが advisory lock
 * 728350 を取って CONFIRMED の quantity 合計で判定することだけに依存していた。
 *
 * 顧客側の見え方: 「残り 3 枠」の表示で申し込み、決済まで完了したうえで当日入場できない。
 *
 * ## アプリ経由のテストでは証明できない
 *
 * `registration-create-commands.ts` が先に DomainError で止めるので、**trigger を
 * 消しても緑のまま**になる。ここは Prisma のコマンドを通さず、行を直接書いて
 * DB の反応だけを見る。
 *
 * ## 3 方向を見る
 *
 *   1. 申込を足して枠の定員を超える
 *   2. 申込を足してチケットの定員を超える（枠にはまだ余裕がある）
 *   3. **定員を下げて**既存の確定申込を下回る（申込側の trigger では止まらない）
 *
 * ## 巻き戻し
 *
 * CONSTRAINT TRIGGER は DEFERRABLE INITIALLY DEFERRED = COMMIT 時発火なので、
 * 巻き戻す tx の中ではそのままでは一度も発火しない。`SET CONSTRAINTS ALL IMMEDIATE`
 * で発火させる。忘れると「例外が出なかった」を「制約が無い」と読み違える。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type Tx = Parameters<Parameters<PrismaModule["prisma"]["$transaction"]>[0]>[0];

let prisma: PrismaModule["prisma"];

/** probe が「拒否されなかった」ときに投げる番人。tx を必ず巻き戻す。 */
class NotRejected extends Error {}

async function rejectedMessage(
  body: (tx: Tx) => Promise<void>,
): Promise<string | null> {
  try {
    await prisma.$transaction(async (tx) => {
      await body(tx);
      throw new NotRejected();
    });
  } catch (error) {
    if (error instanceof NotRejected) return null;
    return error instanceof Error ? error.message : String(error);
  }
  return null;
}

async function fireDeferredConstraints(tx: Tx): Promise<void> {
  await tx.$executeRaw`SET CONSTRAINTS ALL IMMEDIATE`;
}

const SLOT_CAPACITY = 10;
const TICKET_CAPACITY = 4;
/** 確定済みで埋まっている人数（枠にもチケットにも効く）。 */
const CONFIRMED_QUANTITY = 3;

let categoryId: string;
let eventId: string;
let slotId: string;
let limitedTicketId: string;
let openTicketId: string;
let seededRegistrationId: string;
let nextSort = 51_000_000 + Math.floor(Math.random() * 1_000_000);

describeMaybe("定員超過を DB が拒否する", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));

    const suffix = crypto.randomUUID();
    const category = await prisma.eventCategory.create({
      data: { name: `Capacity Guard ${suffix}`, sortOrder: nextSort++ },
      select: { id: true },
    });
    categoryId = category.id;

    const slotStart = new Date("2099-12-01T01:00:00.000Z");
    const fixture = await prisma.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          title: `Capacity Guard Event ${suffix}`,
          slug: `capacity-guard-${suffix}`,
          descriptionJson: {},
          descriptionHtml: "",
          descriptionPlainText: "",
          status: "DRAFT",
          scheduleMode: "SINGLE_OCCURRENCE",
          categoryId,
        },
        select: { id: true },
      });
      const slot = await tx.eventTimeSlot.create({
        data: {
          eventId: event.id,
          startAt: slotStart,
          endAt: new Date(slotStart.getTime() + 60 * 60 * 1000),
          capacity: SLOT_CAPACITY,
        },
        select: { id: true },
      });
      // 定員つきチケットと、無制限チケット（capacity NULL）の 2 枚。
      const limited = await tx.eventTicket.create({
        data: {
          eventId: event.id,
          name: "限定席",
          price: 0,
          capacity: TICKET_CAPACITY,
          sortOrder: nextSort++,
        },
        select: { id: true },
      });
      const open = await tx.eventTicket.create({
        data: {
          eventId: event.id,
          name: "一般",
          price: 0,
          capacity: null,
          sortOrder: nextSort++,
        },
        select: { id: true },
      });
      const registration = await tx.eventRegistration.create({
        data: {
          eventId: event.id,
          slotId: slot.id,
          ticketId: limited.id,
          name: "既存の確定申込",
          quantity: CONFIRMED_QUANTITY,
          status: "CONFIRMED",
        },
        select: { id: true },
      });
      return {
        eventId: event.id,
        slotId: slot.id,
        limitedTicketId: limited.id,
        openTicketId: open.id,
        registrationId: registration.id,
      };
    });
    eventId = fixture.eventId;
    slotId = fixture.slotId;
    limitedTicketId = fixture.limitedTicketId;
    openTicketId = fixture.openTicketId;
    seededRegistrationId = fixture.registrationId;
  });

  afterAll(async () => {
    await prisma.eventRegistration.deleteMany({ where: { eventId } });
    await prisma.eventTicket.deleteMany({ where: { eventId } });
    await prisma.$transaction(async (tx) => {
      await tx.eventTimeSlot.deleteMany({ where: { eventId } });
      await tx.event.deleteMany({ where: { id: eventId } });
    });
    await prisma.eventCategory.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  test("枠の定員を超える確定申込は拒否される", async () => {
    const message = await rejectedMessage(async (tx) => {
      await tx.eventRegistration.create({
        data: {
          eventId,
          slotId,
          ticketId: openTicketId,
          name: "枠あふれ",
          // 既存 3 + 8 = 11 > 10。チケットは無制限なので枠側だけが効く。
          quantity: SLOT_CAPACITY - CONFIRMED_QUANTITY + 1,
          status: "CONFIRMED",
        },
      });
      await fireDeferredConstraints(tx);
    });

    expect(message).toContain("capacity exceeded");
    expect(message).toContain("EventTimeSlot");
  });

  test("チケットの定員を超える確定申込は、枠に余裕があっても拒否される", async () => {
    const message = await rejectedMessage(async (tx) => {
      await tx.eventRegistration.create({
        data: {
          eventId,
          slotId,
          ticketId: limitedTicketId,
          name: "チケットあふれ",
          // 既存 3 + 2 = 5 > 4（チケット）。枠は 3 + 2 = 5 <= 10 で余裕がある。
          quantity: TICKET_CAPACITY - CONFIRMED_QUANTITY + 1,
          status: "CONFIRMED",
        },
      });
      await fireDeferredConstraints(tx);
    });

    expect(message).toContain("EventTicket");
    expect(message).toContain("capacity exceeded");
  });

  test("定員内の確定申込は通る（gate が何でも拒否しているのではない）", async () => {
    const message = await rejectedMessage(async (tx) => {
      await tx.eventRegistration.create({
        data: {
          eventId,
          slotId,
          ticketId: limitedTicketId,
          name: "定員内",
          quantity: TICKET_CAPACITY - CONFIRMED_QUANTITY,
          status: "CONFIRMED",
        },
      });
      await fireDeferredConstraints(tx);
    });

    expect(message).toBeNull();
  });

  test("CANCELLED の申込は合計に入らない（status で数える契約）", async () => {
    const message = await rejectedMessage(async (tx) => {
      await tx.eventRegistration.create({
        data: {
          eventId,
          slotId,
          ticketId: openTicketId,
          name: "キャンセル済み",
          quantity: SLOT_CAPACITY * 10,
          status: "CANCELLED",
        },
      });
      await fireDeferredConstraints(tx);
    });

    expect(message).toBeNull();
  });

  test("枠の定員を確定済み人数より下げる UPDATE は拒否される", async () => {
    const message = await rejectedMessage(async (tx) => {
      await tx.eventTimeSlot.update({
        where: { id: slotId },
        data: { capacity: CONFIRMED_QUANTITY - 1 },
      });
      await fireDeferredConstraints(tx);
    });

    expect(message).toContain("EventTimeSlot");
    expect(message).toContain("capacity exceeded");

    const unchanged = await prisma.eventTimeSlot.findUniqueOrThrow({
      where: { id: slotId },
      select: { capacity: true },
    });
    expect(unchanged.capacity).toBe(SLOT_CAPACITY);
  });

  test("チケットの定員を確定済み人数より下げる UPDATE は拒否される", async () => {
    const message = await rejectedMessage(async (tx) => {
      await tx.eventTicket.update({
        where: { id: limitedTicketId },
        data: { capacity: CONFIRMED_QUANTITY - 1 },
      });
      await fireDeferredConstraints(tx);
    });

    expect(message).toContain("EventTicket");
    expect(message).toContain("capacity exceeded");

    const unchanged = await prisma.eventTicket.findUniqueOrThrow({
      where: { id: limitedTicketId },
      select: { capacity: true },
    });
    expect(unchanged.capacity).toBe(TICKET_CAPACITY);
  });

  test("既存の確定申込は残っている（probe がすべて巻き戻っている）", async () => {
    const rows = await prisma.eventRegistration.findMany({
      where: { eventId },
      select: { id: true },
    });
    expect(rows.map((row) => row.id)).toEqual([seededRegistrationId]);
  });
});
