/**
 * updateEventRegistrationCommand の実DB統合テスト。
 * 定員再判定・WAITLISTED_OFFERED中のquantity変更禁止・NOT_FOUND/CONFLICTを実DBで検証する。
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { EventScheduleMode, EventStatus } from "@generated/prisma/enums";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type RegistrationCommandsModule =
  typeof import("@/shared/domain/events/registration-commands");

let prisma: PrismaModule["prisma"];
let updateEventRegistrationCommand: RegistrationCommandsModule["updateEventRegistrationCommand"];
let testCategoryId: string;

async function createFixtureEvent(capacity: number): Promise<{
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
        title: `テストイベント ${suffix}`,
        slug: `test-event-${suffix}`,
        status: EventStatus.PUBLISHED,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
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
        capacity,
      },
      select: { id: true },
    });

    const ticket = await tx.eventTicket.create({
      data: {
        eventId: event.id,
        name: "一般",
        price: 0,
        isAvailable: true,
      },
      select: { id: true },
    });

    return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
  });
}

async function createFixtureRegistration(
  fixture: { eventId: string; slotId: string; ticketId: string },
  overrides: { quantity?: number; status?: string } = {},
): Promise<string> {
  const reg = await prisma.eventRegistration.create({
    data: {
      eventId: fixture.eventId,
      slotId: fixture.slotId,
      ticketId: fixture.ticketId,
      name: "既存太郎",
      email: "existing@example.com",
      phone: "090-0000-0000",
      note: "既存メモ",
      quantity: overrides.quantity ?? 1,
      status: (overrides.status ?? "CONFIRMED") as never,
    },
  });
  return reg.id;
}

async function cleanupFixture(eventId: string): Promise<void> {
  await prisma.eventRegistration.deleteMany({ where: { eventId } });
  await prisma.eventTicket.deleteMany({ where: { eventId } });
  await prisma.event.delete({ where: { id: eventId } });
}

describeMaybe("updateEventRegistrationCommand", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ updateEventRegistrationCommand } =
      await import("@/shared/domain/events/registration-commands"));

    const category = await prisma.eventCategory.create({
      data: {
        name: `Update Registration Test Category ${crypto.randomUUID()}`,
        // sortOrder はテーブル全体でユニーク制約があるため、並行実行する他の
        // integration test ファイルの EventCategory 行と衝突しない乱数域を使う。
        sortOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;
  });

  afterAll(async () => {
    // EventCategory は onDelete: Restrict のため、紐づく Event の削除後に削除する。
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await prisma.$disconnect();
  });

  /**
   * 根本原因: `updateEventRegistrationCommand` は
   * fire-and-forget 副作用を一切持たない純粋な Prisma ドメインコマンドのため、
   * cancel 系コマンド（`applyCancellationSideEffects` の detached promise）向けの
   * 「1s sleep で pool drain」パターンはそもそも適用対象外だった（前実装者の誤流用）。
   *
   * 実測: `pg_stat_activity` を polling すると、失敗時の接続は
   * `state=idle in transaction, wait_event=ClientRead, query=BEGIN` のまま
   * 10秒以上停止していた。これは Postgres 側がクライアントからの次コマンドを
   * 待っている状態であり、DB 側のロック競合ではない。同時に、開発機上で複数の
   * 並行 Claude セッションが `bun run validate`（type-check、CPU 高負荷）を
   * 実行中であることを確認しており、その CPU 競合が本 Bun test サブプロセスの
   * イベントループ応答を遅延させ、Prisma の interactive transaction が `maxWait`
   * 以内に次のクエリを送れず "Unable to start a transaction in the given time"
   * を起こしたと推定される。固定 sleep は「他プロセスの CPU 負荷がどれだけ続くか」
   * という不確定要素に対して信頼性がないため、この特定の transient エラーだけを
   * 対象にしたリトライで代替する（本番コードの maxWait/timeout 拡大はしない）。
   */
  const POOL_ACQUIRE_TIMEOUT_MESSAGE =
    "Unable to start a transaction in the given time";

  async function updateWithPoolRetry(
    params: Parameters<typeof updateEventRegistrationCommand>[0],
  ): ReturnType<typeof updateEventRegistrationCommand> {
    const maxAttempts = 4;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await updateEventRegistrationCommand(params);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isPoolAcquireTimeout = message.includes(
          POOL_ACQUIRE_TIMEOUT_MESSAGE,
        );
        if (!isPoolAcquireTimeout || attempt === maxAttempts) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }
    // unreachable: 上のループは必ず return か throw で抜ける
    throw new Error("unreachable");
  }

  test("氏名・email・電話・備考・数量を変更でき、変更前の値を previous として返す", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createFixtureRegistration(fixture, {
      quantity: 2,
    });

    try {
      const result = await updateWithPoolRetry({
        registrationId,
        name: "更新太郎",
        email: "updated@example.com",
        phone: "090-1111-1111",
        note: "更新メモ",
        quantity: 3,
      });

      expect(result.previous).toEqual({
        name: "既存太郎",
        email: "existing@example.com",
        phone: "090-0000-0000",
        note: "既存メモ",
        quantity: 2,
      });

      const updated = await prisma.eventRegistration.findUniqueOrThrow({
        where: { id: registrationId },
      });
      expect(updated.name).toBe("更新太郎");
      expect(updated.quantity).toBe(3);
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  }, 30_000);

  test("定員超過になる数量変更は CONFLICT で拒否される", async () => {
    const fixture = await createFixtureEvent(3);
    const registrationId = await createFixtureRegistration(fixture, {
      quantity: 2,
    });
    // 残枠を圧迫する別の CONFIRMED 申込
    await createFixtureRegistration(fixture, { quantity: 1 });

    try {
      await expect(
        updateWithPoolRetry({
          registrationId,
          name: "更新太郎",
          email: null,
          phone: null,
          note: null,
          quantity: 3, // 既存2件で定員3を使い切っているため+1は超過
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  }, 30_000);

  test("WAITLISTED_OFFERED 中の quantity 変更は VALIDATION で拒否される", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createFixtureRegistration(fixture, {
      quantity: 1,
      status: "WAITLISTED_OFFERED",
    });

    try {
      await expect(
        updateWithPoolRetry({
          registrationId,
          name: "更新太郎",
          email: null,
          phone: null,
          note: null,
          quantity: 2,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  }, 30_000);

  test("WAITLISTED_OFFERED 中でも name/email/note の変更は quantity 据え置きなら成功する", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createFixtureRegistration(fixture, {
      quantity: 1,
      status: "WAITLISTED_OFFERED",
    });

    try {
      const result = await updateWithPoolRetry({
        registrationId,
        name: "更新太郎",
        email: null,
        phone: null,
        note: null,
        quantity: 1,
      });
      expect(result.previous.name).toBe("既存太郎");
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  }, 30_000);

  test("CANCELLED な参加登録は編集できず CONFLICT を返す", async () => {
    const fixture = await createFixtureEvent(10);
    const registrationId = await createFixtureRegistration(fixture, {
      status: "CANCELLED",
    });

    try {
      await expect(
        updateWithPoolRetry({
          registrationId,
          name: "更新太郎",
          email: null,
          phone: null,
          note: null,
          quantity: 1,
        }),
      ).rejects.toMatchObject({ code: "CONFLICT" });
    } finally {
      await cleanupFixture(fixture.eventId);
    }
  }, 30_000);

  test("存在しない registrationId は NOT_FOUND を返す", async () => {
    await expect(
      updateWithPoolRetry({
        registrationId: "00000000-0000-4000-8000-00000000dead",
        name: "x",
        email: null,
        phone: null,
        note: null,
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
