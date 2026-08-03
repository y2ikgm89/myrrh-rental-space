/**
 * イベントのゴミ箱運用（復元 / 完全削除）の統合テスト（実 DB 必須）。
 *
 * ここで確かめるのは、静的には確かめようがない 2 点:
 *
 * **1. 復元はスペース占有の再取得である。** `checkSpaceOverlap` は
 * `event: { deletedAt: null }` で絞るので、論理削除した時点でイベントはスペースを
 * 手放す。ゴミ箱にある間に同じ時間帯へ予約が入ったら、復元は**二重予約**になる。
 * `restoreEventCommand` はそれを CONFLICT で止める。
 *
 * **2. 完全削除を止めるのは会計証跡だけ。** 当初は「子どうしが Restrict で結ばれて
 * いる（`EventRegistration.slotId` / `ticketId`）ので明示順で消す必要がある」と
 * 考えていたが、実測では素の `event.delete()` で通った（兄弟も同じ DELETE で消える
 * ため Restrict が成立する）。実際に弾かれるのは `Receipt` / `Refund` が付いた申込を
 * 含むときで、そのとき生の P2003（`receipts_eventRegistrationId_fkey`）が上がる。
 * 両方を実測で固定して、ガードが飾りでないことと、順序制御が不要であることを示す。
 *
 * == 実行条件 ==
 * `bun run test:integration` が docker-compose の test-db 既定値を注入する。
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
type CommandsModule = typeof import("@/shared/domain/events/commands");

let prisma: PrismaModule["prisma"];
let restoreEventCommand: CommandsModule["restoreEventCommand"];
let permanentlyDeleteEventCommand: CommandsModule["permanentlyDeleteEventCommand"];
let deleteEventCommand: CommandsModule["deleteEventCommand"];

let categoryId: string;
const createdEventIds: string[] = [];
let nextSort = 2_100_000_000;

type Fixture = { eventId: string; slotId: string; ticketId: string };

async function createEvent(options?: {
  deleted?: boolean;
  startAt?: Date;
}): Promise<Fixture> {
  const suffix = crypto.randomUUID().replace(/-/gu, "").slice(0, 12);
  const startAt = options?.startAt ?? new Date(Date.now() + 30 * 86_400_000);

  // SINGLE_OCCURRENCE は commit 時に「slot ちょうど 1 件」を要求する constraint
  // trigger があるため、event と slot を単一 tx で作る。
  const created = await prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        slug: `trash-${suffix}`,
        title: `Trash ${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>t</p>",
        descriptionPlainText: "t",
        status: EventStatus.PUBLISHED,
        thumbnailUrl: "https://example.test/e.jpg",
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        categoryId,
        ...(options?.deleted ? { deletedAt: new Date() } : {}),
      },
      select: { id: true },
    });
    const slot = await tx.eventTimeSlot.create({
      data: {
        eventId: event.id,
        startAt,
        endAt: new Date(startAt.getTime() + 3_600_000),
        capacity: 10,
      },
      select: { id: true },
    });
    const ticket = await tx.eventTicket.create({
      data: {
        eventId: event.id,
        name: `T ${suffix}`,
        price: 1000,
        capacity: 10,
        sortOrder: nextSort++,
      },
      select: { id: true },
    });
    return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
  });

  createdEventIds.push(created.eventId);
  return created;
}

async function addRegistration(f: Fixture): Promise<string> {
  const suffix = crypto.randomUUID().slice(0, 8);
  const registration = await prisma.eventRegistration.create({
    data: {
      eventId: f.eventId,
      slotId: f.slotId,
      ticketId: f.ticketId,
      name: `Guest ${suffix}`,
      email: `trash-${suffix}@example.test`,
      quantity: 1,
      status: RegistrationStatus.CONFIRMED,
      paymentStatus: PaymentStatus.UNPAID,
    },
    select: { id: true },
  });
  return registration.id;
}

describeMaybe("イベントのゴミ箱運用", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({
      restoreEventCommand,
      permanentlyDeleteEventCommand,
      deleteEventCommand,
    } = await import("@/shared/domain/events/commands"));
    await prisma.$queryRaw`SELECT 1`;

    const category = await prisma.eventCategory.create({
      data: {
        name: `Trash Category ${crypto.randomUUID()}`,
        sortOrder: 20_000_000 + Math.floor(Math.random() * 10_000_000),
      },
      select: { id: true },
    });
    categoryId = category.id;
  });

  afterAll(async () => {
    for (const id of createdEventIds) {
      await prisma.eventRegistration.deleteMany({ where: { eventId: id } });
      await prisma.$transaction(async (tx) => {
        await tx.eventTimeSlot.deleteMany({ where: { eventId: id } });
        await tx.eventTicket.deleteMany({ where: { eventId: id } });
        await tx.event.deleteMany({ where: { id } });
      });
    }
    await prisma.eventCategory.deleteMany({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  test("削除していないイベントは復元できない", async () => {
    const f = await createEvent();

    let code: string | null = null;
    try {
      await restoreEventCommand(f.eventId);
    } catch (error) {
      code =
        error instanceof Error && "code" in error
          ? String((error as { code: unknown }).code)
          : null;
    }
    expect(code).toBe("VALIDATION");
  });

  test("ゴミ箱のイベントを復元できる", async () => {
    const f = await createEvent();
    await deleteEventCommand(f.eventId);

    await restoreEventCommand(f.eventId);

    const restored = await prisma.event.findUnique({
      where: { id: f.eventId },
      select: { deletedAt: true, deletedById: true },
    });
    expect(restored?.deletedAt).toBeNull();
    expect(restored?.deletedById).toBeNull();
  });

  test("slug を別イベントに取られていると復元できない", async () => {
    const f = await createEvent();
    const original = await prisma.event.findUnique({
      where: { id: f.eventId },
      select: { slug: true },
    });
    await deleteEventCommand(f.eventId);

    // ゴミ箱は slug を解放するので、同じ slug で新しいイベントを作れてしまう
    const replacement = await createEvent();
    await prisma.event.update({
      where: { id: replacement.eventId },
      data: { slug: original?.slug ?? "" },
    });

    let message: string | null = null;
    try {
      await restoreEventCommand(f.eventId);
    } catch (error) {
      message = error instanceof Error ? error.message : null;
    }
    expect(message).toContain("同じスラッグのイベントが既に存在する");
  });

  test("ゴミ箱に入れていないイベントは完全削除できない", async () => {
    const f = await createEvent();

    let code: string | null = null;
    try {
      await permanentlyDeleteEventCommand(f.eventId);
    } catch (error) {
      code =
        error instanceof Error && "code" in error
          ? String((error as { code: unknown }).code)
          : null;
    }
    expect(code).toBe("CONFLICT");
  });

  test("申込ごと完全削除できる", async () => {
    const f = await createEvent();
    await addRegistration(f);
    await deleteEventCommand(f.eventId);

    await permanentlyDeleteEventCommand(f.eventId);

    expect(await prisma.event.count({ where: { id: f.eventId } })).toBe(0);
    expect(
      await prisma.eventRegistration.count({ where: { eventId: f.eventId } }),
    ).toBe(0);
    expect(
      await prisma.eventTimeSlot.count({ where: { eventId: f.eventId } }),
    ).toBe(0);
  });

  test("証跡が無ければ cascade だけで子ごと消える", async () => {
    // 当初は「子どうしの Restrict があるので明示順で消す必要がある」と考えていたが、
    // 実測では素の delete で通る（兄弟も同じ DELETE で消えるため Restrict が成立する）。
    // コマンドが cascade に任せてよい根拠なので、ここで固定する。
    const f = await createEvent();
    await addRegistration(f);

    await prisma.event.delete({ where: { id: f.eventId } });

    expect(await prisma.event.count({ where: { id: f.eventId } })).toBe(0);
    expect(
      await prisma.eventRegistration.count({ where: { eventId: f.eventId } }),
    ).toBe(0);
  });

  test("領収書のある申込を含むイベントは完全削除を拒否する", async () => {
    const f = await createEvent();
    const registrationId = await addRegistration(f);
    await prisma.receipt.create({
      data: {
        serialNo: `RT-${crypto.randomUUID().slice(0, 12)}`,
        eventRegistrationId: registrationId,
        recipientName: "テスト 太郎",
        amount: 1000,
        taxAmount: 100,
        taxRate: 10,
        issuerSnapshot: {},
      },
    });
    await deleteEventCommand(f.eventId);

    let message: string | null = null;
    try {
      await permanentlyDeleteEventCommand(f.eventId);
    } catch (error) {
      message = error instanceof Error ? error.message : null;
    }
    expect(message).toContain("領収書または返金記録のある申込");

    // ガードが飾りでないことの証拠: 素の delete は DB 側で弾かれる。
    // つまりガードは生の P2003 を DomainError に変換している。
    let rawFailed = false;
    try {
      await prisma.event.delete({ where: { id: f.eventId } });
    } catch {
      rawFailed = true;
    }
    expect(rawFailed).toBe(true);

    // 拒否された以上、イベントも申込も残っている
    expect(await prisma.event.count({ where: { id: f.eventId } })).toBe(1);

    await prisma.receipt.deleteMany({
      where: { eventRegistrationId: registrationId },
    });
  });
});
