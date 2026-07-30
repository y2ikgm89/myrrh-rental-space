/**
 * publishEventCommand の status 遷移ガード + 二重 publish 排他の実 DB 回帰テスト。
 *
 * 修正前は `assertEventStatusTransition` を呼ばず `prisma.event.update` を
 * 直接叩いていたため、EVENT_STATUS_TRANSITIONS が禁止する CANCELLED/ARCHIVED
 * → PUBLISHED が無条件に成功していた（本来 DRAFT → PUBLISHED のみ許可）。
 * 業務上「一度キャンセル/アーカイブしたイベントを再公開する」導線は存在しないため、
 * この bypass は意図しない再公開を招く。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行。`bun run test:integration` が
 * docker-compose の test-db 既定値を注入する。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule = typeof import("@/shared/domain/events/commands");

let prisma: PrismaModule["prisma"];
let publishEventCommand: CommandsModule["publishEventCommand"];
let testCategoryId: string;

type EventFixture = {
  eventId: string;
  cleanup: () => Promise<void>;
};

async function createTestEvent(
  status: "DRAFT" | "CANCELLED" | "ARCHIVED",
): Promise<EventFixture> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 26 * 60 * 60 * 1000);

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        title: `Publish Transition Test ${suffix}`,
        slug: `publish-transition-test-${suffix}`,
        descriptionJson: {},
        descriptionHtml: "",
        descriptionPlainText: "",
        status,
        scheduleMode: "SINGLE_OCCURRENCE",
        categoryId: testCategoryId,
      },
      select: { id: true },
    });
    await tx.eventTimeSlot.create({
      data: { eventId: created.id, startAt: start, endAt: end, capacity: 10 },
    });
    return created;
  });

  return {
    eventId: event.id,
    cleanup: async () => {
      await prisma.event.deleteMany({ where: { id: event.id } });
    },
  };
}

describeMaybe("publishEventCommand の status 遷移ガード", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ publishEventCommand } = await import("@/shared/domain/events/commands"));

    const category = await prisma.eventCategory.create({
      data: {
        name: `Publish Transition Category ${crypto.randomUUID()}`,
        sortOrder: 30_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;
    // 接続プールをウォームアップ（コールドスタートが並行呼び出しをずらして
    // race を隠すのを防ぐ。space-overlap-concurrency.test.ts と同型）。
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.event.deleteMany({ where: { categoryId: testCategoryId } });
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await prisma.$disconnect();
  });

  test("CANCELLED → PUBLISHED は VALIDATION で拒否される", async () => {
    const { eventId, cleanup } = await createTestEvent("CANCELLED");
    try {
      let thrown: unknown = null;
      try {
        await publishEventCommand(eventId);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toMatchObject({ name: "DomainError", code: "VALIDATION" });

      const row = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
        select: { status: true },
      });
      expect(row.status).toBe("CANCELLED");
    } finally {
      await cleanup();
    }
  });

  test("ARCHIVED → PUBLISHED は VALIDATION で拒否される", async () => {
    const { eventId, cleanup } = await createTestEvent("ARCHIVED");
    try {
      let thrown: unknown = null;
      try {
        await publishEventCommand(eventId);
      } catch (err) {
        thrown = err;
      }
      expect(thrown).toMatchObject({ name: "DomainError", code: "VALIDATION" });

      const row = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
        select: { status: true },
      });
      expect(row.status).toBe("ARCHIVED");
    } finally {
      await cleanup();
    }
  });

  test("DRAFT → PUBLISHED は正常に遷移する", async () => {
    const { eventId, cleanup } = await createTestEvent("DRAFT");
    try {
      await publishEventCommand(eventId);

      const row = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
        select: { status: true, publishedAt: true },
      });
      expect(row.status).toBe("PUBLISHED");
      expect(row.publishedAt).not.toBeNull();
    } finally {
      await cleanup();
    }
  });

  test("既に PUBLISHED なイベントへの2回目の publish は冪等に成功する（cancelEventCommand と同じ no-op 設計）", async () => {
    // assertEventStatusTransition は from===to を no-op として許可する
    // （cancelEventCommand の「別 admin が既に CANCELLED にした→冪等 no-op」と
    // 同じ設計）。そのため PUBLISHED→PUBLISHED の再呼び出しは CONFLICT ではなく
    // 成功する。updateMany の WHERE status: event.status による claim は、
    // 「読み取り時と書込み時で status が変わった」真の race だけを CONFLICT にする。
    const { eventId, cleanup } = await createTestEvent("DRAFT");
    try {
      await publishEventCommand(eventId);
      await publishEventCommand(eventId);

      const row = await prisma.event.findUniqueOrThrow({
        where: { id: eventId },
        select: { status: true },
      });
      expect(row.status).toBe("PUBLISHED");
    } finally {
      await cleanup();
    }
  });
});
