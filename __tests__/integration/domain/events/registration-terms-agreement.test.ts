/**
 * イベント申込の規約同意記録（実 Postgres 必須）。
 *
 * `createEventRegistrationCommand` は `agreedTermsIds` が渡されると、申込と同一
 * トランザクション内で `recordTermsAgreements({ resourceId: registration.id })` を
 * 呼ぶ。`EventRegistration.id` は uuid だが、`resourceId` は複数モデルを指すため
 * `TermsAgreement.resourceId` が `@db.Uuid` だった間は Postgres が
 * `invalid input syntax for type uuid`（Prisma P2007）を返し、トランザクションごと
 * 巻き戻って**申込が 1 件も成立しなかった**（full CI run 30631140902 /
 * 30632351655 の webServer ログで実測）。
 *
 * 本番の init migration は利用規約・プライバシーポリシー・キャンセルポリシーを
 * `EVENT_REGISTRATION` scope 付き・公開状態で INSERT するため、この経路は
 * 本番でも必ず通る。
 *
 * ## なぜ既存テストが素通りしたか
 *
 * `__tests__/integration/actions/public/event-registration.test.ts` は
 * `createEventRegistrationCommand` を丸ごと mock しており、さらに
 * `agreedTermsIds` を一度も渡していない。実装側は
 * `if (data.agreedTermsIds && data.agreedTermsIds.length > 0)` で分岐するため、
 * `recordTermsAgreements` に到達するケースがどのテストにも無かった。
 *
 * == 実行条件 ==
 * `bun run test:integration` は docker-compose の test-db 既定値を注入する。
 * `TEST_DATABASE_URL` 未設定時は describe ごと silent skip。
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import {
  EventScheduleMode,
  EventStatus,
  RegistrationStatus,
  TermsScope,
} from "@generated/prisma/enums";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を動的 import する前に実テスト DB へ向け直す。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// `createEventRegistrationCommand` 冒頭の feature module gate は `'use cache'` 付きの
// Settings 読取りを経由する。本テストの対象は規約同意の永続化なので、
// registration-overbooking.test.ts と同じ mock で gate をバイパスする。
mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: () => Promise.resolve(true),
}));

type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule =
  typeof import("@/shared/domain/events/registration-commands");

let prisma: PrismaModule["prisma"];
let createEventRegistrationCommand: CommandsModule["createEventRegistrationCommand"];
let testCategoryId: string;

interface EventFixture {
  readonly eventId: string;
  readonly slotId: string;
  readonly ticketId: string;
}

async function createTestEvent(): Promise<EventFixture> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 26 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: "Terms Agreement Test",
        slug: `terms-agreement-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
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
      data: { eventId: event.id, startAt: start, endAt: end, capacity: 10 },
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

/** `EVENT_REGISTRATION` scope の公開規約を 1 件作る（本番 init migration と同条件）。 */
async function createEventRegistrationTerms(): Promise<string> {
  const suffix = crypto.randomUUID();
  const doc = await prisma.termsDocument.create({
    data: {
      type: "terms",
      slug: `e2e-terms-${suffix}`.slice(0, 50),
      title: "テスト用利用規約",
      contentJson: { type: "doc" },
      contentHtml: "<p>テスト用の規約本文です。</p>",
      isPublished: true,
      publishedAt: new Date(),
      scopes: [TermsScope.EVENT_REGISTRATION],
      // displayOrder は deletedAt IS NULL の部分 UNIQUE。並行実行する他の
      // integration test と衝突しない乱数域を使う。
      displayOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
      showInFooter: false,
    },
    select: { id: true },
  });
  return doc.id;
}

describeMaybe("createEventRegistrationCommand — 規約同意の記録", () => {
  beforeAll(async () => {
    ({ prisma } = await import("@/shared/db/prisma"));
    ({ createEventRegistrationCommand } =
      await import("@/shared/domain/events/registration-commands"));

    const category = await prisma.eventCategory.create({
      data: {
        name: `Terms Agreement Category ${crypto.randomUUID()}`,
        sortOrder: 10_000_000 + Math.floor(Math.random() * 100_000_000),
      },
      select: { id: true },
    });
    testCategoryId = category.id;
  });

  afterAll(async () => {
    await prisma.eventCategory.deleteMany({ where: { id: testCategoryId } });
    await prisma.$disconnect();
  });

  test("必須規約に同意した申込が成立し TermsAgreement が申込 ID で残る", async () => {
    const { eventId, slotId, ticketId } = await createTestEvent();
    const termsId = await createEventRegistrationTerms();

    try {
      const { registration } = await createEventRegistrationCommand({
        eventId,
        slotId,
        ticketId,
        name: "規約同意 太郎",
        email: `terms-agreement-${crypto.randomUUID()}@example.com`,
        quantity: 1,
        agreedTermsIds: [termsId],
      });

      // 修正前はここに到達せず P2007 が throw されていた
      // （当時 `EventRegistration.id` は cuid で、uuid 列へ渡していたため）。
      // コマンドの select は status を返さないので DB 行で確認する。
      const persisted = await prisma.eventRegistration.findUnique({
        where: { id: registration.id },
        select: { status: true },
      });
      expect(persisted?.status).toBe(RegistrationStatus.CONFIRMED);

      const agreements = await prisma.termsAgreement.findMany({
        where: { termsId },
        select: { resourceId: true, scope: true },
      });

      expect(agreements).toEqual([
        { resourceId: registration.id, scope: TermsScope.EVENT_REGISTRATION },
      ]);

      // 値がそのまま保存されている（列は text なので uuid へ丸められたりしない）。
      expect(agreements[0]?.resourceId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
      );
    } finally {
      // TermsAgreement は append-only（DB trigger が UPDATE/DELETE を拒否）。
      // 参照している TermsDocument も削除できないため、この 2 つは残す。
      await prisma.eventRegistration.deleteMany({ where: { eventId } });
      await prisma.eventTicket.deleteMany({ where: { eventId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
    }
  }, 30_000);
});
