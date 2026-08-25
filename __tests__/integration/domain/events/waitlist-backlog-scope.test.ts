/**
 * backfill が「今日の時点で新規に並べる待機列」だけを拾うことの検査（実 Postgres）。
 *
 * ## なぜ実 DB でやるのか
 *
 * 述語が Prisma のリレーション filter（`event` / `ticket` / `slot` を跨ぐ）と、
 * `registrationDeadline ?? slot.startAt` を表す `OR` の 2 枝でできている。
 * mock では「引数の形」しか固定できず、枝の取り違えも join の向きも捕まらない。
 *
 * ## 何を固定するか
 *
 * `findWaitlistBacklogGroups` が返してよいのは、`registerWaitlistEntryCommand` が
 * **今この瞬間に新規登録を受け付ける**待機列だけ。除外は 5 つ:
 *
 * 1. 開催が終わっている（締切未設定なので `slot.startAt` が基準）
 * 2. 申込締切を過ぎている（`registrationDeadline` が明示されている）
 * 3. `registrationOpen: false`（受付終了）
 * 4. `status !== PUBLISHED`（下書きへ戻した）
 * 5. `deletedAt !== null`（論理削除）
 * 加えて `ticket.isAvailable: false`（販売停止）も除く。
 *
 * これが無いと、終了したイベントの待機者に「繰り上げ当選しました」が届く。
 * しかも `confirmWaitlistOfferCommand` はイベントの日付も締切も見ない（offer の
 * `expiresAt` しか見ない）ので、**受け取った人は過去のイベントに確定できてしまう**。
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
type QueriesModule = typeof import("@/shared/domain/events/waitlist-queries");

let prisma: PrismaModule["prisma"];
let findWaitlistBacklogGroups: QueriesModule["findWaitlistBacklogGroups"];

/** 判定の基準時刻。fixture の日付はすべてこれを挟んで前後に置く。 */
const NOW = new Date("2027-06-15T00:00:00.000Z");
const FUTURE = new Date("2027-07-01T00:00:00.000Z");
const PAST = new Date("2027-05-01T00:00:00.000Z");

interface EventShape {
  readonly label: string;
  readonly slotStartAt: Date;
  readonly status?: EventStatus;
  readonly registrationOpen?: boolean;
  readonly registrationDeadline?: Date | null;
  readonly deleted?: boolean;
  readonly ticketAvailable?: boolean;
}

describeMaybe("backfill は今日並べる待機列だけを拾う — 実 Postgres", () => {
  const eventIds: string[] = [];
  let categoryId: string;

  async function createWaitlistedEvent(shape: EventShape): Promise<string> {
    const suffix = crypto.randomUUID();
    const end = new Date(shape.slotStartAt.getTime() + 60 * 60 * 1000);

    const { eventId, slotId, ticketId } = await prisma.$transaction(
      async (tx) => {
        const event = await tx.event.create({
          data: {
            title: `Backlog scope ${shape.label}`,
            slug: `backlog-scope-${shape.label}-${suffix}`,
            descriptionJson: { type: "doc" },
            descriptionHtml: "<p>t</p>",
            descriptionPlainText: "t",
            status: shape.status ?? EventStatus.PUBLISHED,
            scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
            registrationOpen: shape.registrationOpen ?? true,
            registrationDeadline: shape.registrationDeadline ?? null,
            firstSlotStartAt: shape.slotStartAt,
            lastSlotEndAt: end,
            categoryId,
          },
          select: { id: true },
        });
        const slot = await tx.eventTimeSlot.create({
          data: {
            eventId: event.id,
            startAt: shape.slotStartAt,
            endAt: end,
            capacity: 10,
          },
          select: { id: true },
        });
        const ticket = await tx.eventTicket.create({
          data: {
            eventId: event.id,
            name: "一般",
            price: 0,
            isAvailable: shape.ticketAvailable ?? true,
          },
          select: { id: true },
        });
        return { eventId: event.id, slotId: slot.id, ticketId: ticket.id };
      },
    );
    eventIds.push(eventId);

    await prisma.eventRegistration.create({
      data: {
        eventId,
        slotId,
        ticketId,
        name: `待機 ${shape.label}`,
        email: `backlog-${shape.label}-${suffix}@example.com`,
        quantity: 1,
        status: RegistrationStatus.WAITLISTED,
        waitlistedAt: PAST,
      },
    });

    // 論理削除は行を作ってから。作成時に deletedAt を入れると
    // `events_slug_active_key`（partial unique）の前提が変わって読みにくい。
    if (shape.deleted) {
      await prisma.event.update({
        where: { id: eventId },
        data: { deletedAt: NOW },
      });
    }

    return eventId;
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ findWaitlistBacklogGroups } =
      await import("@/shared/domain/events/waitlist-queries"));
    await prisma.$queryRaw`SELECT 1`;
    const category = await prisma.eventCategory.create({
      data: {
        name: `Backlog scope category ${crypto.randomUUID()}`,
        sortOrder: 30_000_000 + Math.floor(Math.random() * 100_000_000),
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

  test("受付中のイベントだけが候補になる", async () => {
    const open = await createWaitlistedEvent({
      label: "open",
      slotStartAt: FUTURE,
    });
    const openWithDeadline = await createWaitlistedEvent({
      label: "open-deadline",
      slotStartAt: FUTURE,
      registrationDeadline: FUTURE,
    });

    const excluded = {
      past: await createWaitlistedEvent({
        label: "past",
        slotStartAt: PAST,
      }),
      deadlinePassed: await createWaitlistedEvent({
        label: "deadline-passed",
        slotStartAt: FUTURE,
        registrationDeadline: PAST,
      }),
      closed: await createWaitlistedEvent({
        label: "closed",
        slotStartAt: FUTURE,
        registrationOpen: false,
      }),
      draft: await createWaitlistedEvent({
        label: "draft",
        slotStartAt: FUTURE,
        status: EventStatus.DRAFT,
      }),
      deleted: await createWaitlistedEvent({
        label: "deleted",
        slotStartAt: FUTURE,
        deleted: true,
      }),
      ticketUnavailable: await createWaitlistedEvent({
        label: "ticket-off",
        slotStartAt: FUTURE,
        ticketAvailable: false,
      }),
    };

    const groups = await findWaitlistBacklogGroups(NOW);
    const found = new Set(groups.map((group) => group.eventId));

    // 空振り検査: 受付中の 2 件は必ず拾う（拾わない実装でも下の除外は通るため）。
    expect(found.has(open)).toBe(true);
    expect(found.has(openWithDeadline)).toBe(true);

    // 除外側。落ちたときにどれが漏れたか分かるよう、まとめて 1 度に比較する。
    expect(
      Object.entries(excluded)
        .filter(([, eventId]) => found.has(eventId))
        .map(([reason]) => reason),
    ).toEqual([]);
  });
});
