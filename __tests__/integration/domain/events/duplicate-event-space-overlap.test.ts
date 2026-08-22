/**
 * duplicateEventCommand の Space overlap 検査の実 DB 回帰テスト。
 *
 * 修正前は spaceId を持つイベントを複製する際、createEventCommand /
 * updateEventCommand が行っている lockSpaceForTransaction + checkSpaceOverlap を
 * 一切呼ばず、source と全く同じ spaceId・時間枠を持つ新規 DRAFT イベントを
 * そのまま作成していた。DRAFT は ACTIVE_EVENT_STATUSES
 * (src/shared/domain/spaces/overlap.ts) に含まれる占有ステータスであり、
 * 複製元が DRAFT/PUBLISHED であれば複製直後に「同一 Space・同一時間帯の
 * アクティブなイベントが 2 件」という状態が overlap 検査なしで成立してしまう。
 *
 * 現在は DB 側の CONSTRAINT TRIGGER (`check_event_slot_space_is_free` /
 * `check_event_space_is_free`、実体は `prisma/baseline/invariants.sql`) が
 * Event 同士の重複も拒否する（`cross-table-overlap-triggers.test.ts` が実測）。
 * ただしそこで出るのは生の 23P01 なので、管理者に理由を返すのは依然として
 * アプリ層の `checkSpaceOverlap` の役目であり、ここはその層を固定する。
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
let duplicateEventCommand: CommandsModule["duplicateEventCommand"];
let testCategoryId: string;
let testSpaceId: string;
let testLocationId: string;

type EventFixture = {
  eventId: string;
  slug: string;
  cleanup: () => Promise<void>;
};

async function createSourceEvent(params: {
  status: "DRAFT" | "PUBLISHED" | "CANCELLED" | "ARCHIVED";
  spaceId: string | null;
  startAt: Date;
  endAt: Date;
}): Promise<EventFixture> {
  const suffix = crypto.randomUUID();
  const slug = `duplicate-overlap-source-${suffix}`;

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.event.create({
      data: {
        title: `Duplicate Overlap Source ${suffix}`,
        slug,
        descriptionJson: {},
        descriptionHtml: "",
        descriptionPlainText: "",
        status: params.status,
        scheduleMode: "SINGLE_OCCURRENCE",
        categoryId: testCategoryId,
        spaceId: params.spaceId,
      },
      select: { id: true },
    });
    await tx.eventTimeSlot.create({
      data: {
        eventId: created.id,
        startAt: params.startAt,
        endAt: params.endAt,
        capacity: 10,
      },
    });
    return created;
  });

  return {
    eventId: event.id,
    slug,
    cleanup: async () => {
      await prisma.event.deleteMany({ where: { id: event.id } });
    },
  };
}

describeMaybe("duplicateEventCommand の Space overlap 検査", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ duplicateEventCommand } =
      await import("@/shared/domain/events/commands"));

    const suffix = crypto.randomUUID();
    const location = await prisma.location.create({
      data: {
        slug: `duplicate-overlap-loc-${suffix}`,
        name: `Duplicate Overlap Loc ${suffix}`,
        address: "東京都テスト区1-2-3",
        imageUrl: "https://example.com/loc.jpg",
        sortOrder: 1_400_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testLocationId = location.id;

    const space = await prisma.space.create({
      data: {
        slug: `duplicate-overlap-space-${suffix}`,
        name: `Duplicate Overlap Space ${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        capacity: 10,
        hourlyPrice: 1000,
        mainImageUrl: "https://example.com/space.jpg",
        locationId: location.id,
      },
      select: { id: true },
    });
    testSpaceId = space.id;

    const category = await prisma.eventCategory.create({
      data: {
        name: `Duplicate Overlap Category ${suffix}`,
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
    // FK 安全な順序（Space→Location は Restrict）
    await prisma.space.deleteMany({ where: { id: testSpaceId } });
    await prisma.location.deleteMany({ where: { id: testLocationId } });
    await prisma.$disconnect();
  });

  test("同一 Space・同一時間帯の DRAFT イベントを複製すると CONFLICT で拒否される", async () => {
    const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 26 * 60 * 60 * 1000);
    const { eventId, slug, cleanup } = await createSourceEvent({
      status: "DRAFT",
      spaceId: testSpaceId,
      startAt: start,
      endAt: end,
    });

    try {
      // overlap 検査が壊れると duplicateEventCommand は例外なく成功してしまう
      // （= この rejects が落ちること自体が guard の実効証明）。
      await expect(duplicateEventCommand(eventId)).rejects.toMatchObject({
        name: "DomainError",
        code: "CONFLICT",
      });

      // 複製先イベントがロールバックされ DB に残っていないことを確認
      const duplicated = await prisma.event.findFirst({
        where: { slug: `${slug}-copy` },
        select: { id: true },
      });
      expect(duplicated).toBeNull();
    } finally {
      await cleanup();
    }
  });

  test("PUBLISHED イベントも同一 Space・同一時間帯への複製は CONFLICT で拒否される", async () => {
    const start = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 50 * 60 * 60 * 1000);
    const { eventId, cleanup } = await createSourceEvent({
      status: "PUBLISHED",
      spaceId: testSpaceId,
      startAt: start,
      endAt: end,
    });

    try {
      await expect(duplicateEventCommand(eventId)).rejects.toMatchObject({
        name: "DomainError",
        code: "CONFLICT",
      });
    } finally {
      await cleanup();
    }
  });

  test("CANCELLED イベントは同一 Space・同一時間帯でも複製できる（非占有ステータスは overlap 対象外）", async () => {
    const start = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 74 * 60 * 60 * 1000);
    const { eventId, slug, cleanup } = await createSourceEvent({
      status: "CANCELLED",
      spaceId: testSpaceId,
      startAt: start,
      endAt: end,
    });

    try {
      const result = await duplicateEventCommand(eventId);
      expect(result.slug).toBe(`${slug}-copy`);

      const duplicated = await prisma.event.findUniqueOrThrow({
        where: { id: result.id },
        select: { status: true, spaceId: true },
      });
      expect(duplicated.status).toBe("DRAFT");
      expect(duplicated.spaceId).toBe(testSpaceId);

      await prisma.event.deleteMany({ where: { id: result.id } });
    } finally {
      await cleanup();
    }
  });

  test("spaceId が null（外部会場）のイベントは overlap 検査なしで複製できる", async () => {
    const start = new Date(Date.now() + 96 * 60 * 60 * 1000);
    const end = new Date(Date.now() + 98 * 60 * 60 * 1000);
    const { eventId, slug, cleanup } = await createSourceEvent({
      status: "DRAFT",
      spaceId: null,
      startAt: start,
      endAt: end,
    });

    try {
      const result = await duplicateEventCommand(eventId);
      expect(result.slug).toBe(`${slug}-copy`);

      await prisma.event.deleteMany({ where: { id: result.id } });
    } finally {
      await cleanup();
    }
  });
});
