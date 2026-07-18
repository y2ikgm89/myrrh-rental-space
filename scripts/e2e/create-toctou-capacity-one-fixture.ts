import {
  EventScheduleMode,
  EventStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";
import {
  buildParagraphEditorStateJson,
  buildParagraphHtml,
} from "@/shared/lib/lexical/description-defaults";
import { stripHtmlToText } from "@/shared/lib/lexical/html-to-plain-text";
import { parsePrismaInputJson } from "@/shared/db/prisma-input-json";
import { createScriptPrismaClient } from "../_shared/script-prisma";
import { resolveTestDatabaseUrl } from "../test-db-url";

/**
 * E2E fixture: TOCTOU (E2E-P2-03) 用の空 (0 CONFIRMED) capacity=1 イベントを
 * 1 件作成する。同時申込 3〜5 件を投げて「ちょうど 1 件のみが成功する」ことを
 * 検証する `e2e/public/events-registration-toctou-capacity-1.spec.ts` から
 * `execFile("bun", [thisScript], { env: process.env })` で呼ばれる
 * （`create-claim-event-registration-fixture.ts` / `create-waitlist-test-fixture.ts` と
 * 同じ「Playwright test から bun script を子プロセス実行する」パターン）。
 *
 * ## なぜ seed に足さず fixture script でその場作成するか
 *
 * seed の `waitlist-test` イベントは capacity=1 だが「1 CONFIRMED (満員) +
 * 2 WAITLISTED + 1 WAITLISTED_OFFERED」で先に埋まっている。TOCTOU 検証は
 * 「空の capacity=1 に N 件が殺到 → 1 件のみが CONFIRMED になる」ことを
 * 直接見るため、既存 seed を再利用できない。
 *
 * また Playwright は `retries: 2 (CI)` のため、seed に空 event を足す方式だと
 * 初回テスト実行で capacity が消費されて retry 時に "既に満員" に変質する。
 * fixture script でその場作成すれば毎回 fresh な空 slot が保証される。
 *
 * ## サブコマンド
 *
 * - 引数なし: 新規 event を作成し `{ eventSlug, eventId, ticketId, slotId }`
 *   を JSON stdout。
 * - `count <eventId>`: 対象 event の CONFIRMED 申込集計を出力。
 *   `createEventRegistrationCommand` と同一の集計基準（status=CONFIRMED の
 *   quantity 合計）を返す。テスト後半で「DB レベルで正確に 1 件だけ」を再検証する。
 */

process.env["DATABASE_URL"] = resolveTestDatabaseUrl(
  process.env["TEST_DATABASE_URL"],
).url;

interface ToctouFixture {
  readonly eventSlug: string;
  readonly eventId: string;
  readonly ticketId: string;
  readonly slotId: string;
}

interface CountResult {
  readonly eventId: string;
  readonly confirmedCount: number;
  readonly confirmedSumQuantity: number;
  readonly totalCount: number;
}

async function createFixture(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const eventTitle = `E2E TOCTOU capacity=1 ${unique}`;
    const eventSlug = `e2e-toctou-capacity-one-${unique}`;
    const descriptionText =
      "E2E TOCTOU テスト用イベント (定員 1 名の同時申込レース検証)。";
    const descriptionJsonString =
      buildParagraphEditorStateJson(descriptionText);
    const descriptionHtml = buildParagraphHtml(descriptionText);

    // 十分に未来かつ E2E_FIXED_NOW_ISO (2026-07-04T03:00:00Z) より後の固定枠。
    // create-claim-event-registration-fixture.ts と同一日付を再利用する
    // (両者は独立 event として並存する)。
    const startAt = new Date("2027-04-20T01:00:00.000Z");
    const endAt = new Date("2027-04-20T03:00:00.000Z");

    // Event.scheduleMode = SINGLE_OCCURRENCE は DB の DEFERRABLE constraint
    // trigger (`events_schedule_integrity_check`) で「ちょうど 1 つの
    // EventTimeSlot を持つこと」をコミット時に検証するため、Event +
    // EventTimeSlot は同一 interactive transaction 内で作成する。
    const { event, slot, ticket } = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.event.create({
        data: {
          title: eventTitle,
          slug: eventSlug,
          descriptionJson: parsePrismaInputJson(
            descriptionJsonString,
            "e2e toctou fixture description JSON が不正です",
          ),
          descriptionHtml,
          descriptionPlainText: stripHtmlToText(descriptionHtml, 200),
          status: EventStatus.PUBLISHED,
          scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
          registrationOpen: true,
          publishedAt: new Date(),
          firstSlotStartAt: startAt,
          lastSlotEndAt: endAt,
        },
        select: { id: true },
      });

      const createdSlot = await tx.eventTimeSlot.create({
        data: {
          eventId: createdEvent.id,
          startAt,
          endAt,
          // capacity=1 で empty なまま返す（サンプル CONFIRMED は追加しない）。
          // TOCTOU 検証はこの空 slot に N 件を同時投入して 1 件だけ勝つことを見る。
          capacity: 1,
        },
        select: { id: true },
      });

      const createdTicket = await tx.eventTicket.create({
        data: {
          eventId: createdEvent.id,
          name: "一般",
          // 無料チケット: registration Server Action の Stripe checkout 分岐を
          // 迂回し、advisory lock + CONFIRMED 作成の path に集中する
          // (create-waitlist-test-fixture.ts と同じ理由)。
          price: 0,
          unitSize: 1,
          sortOrder: 0,
          isAvailable: true,
        },
        select: { id: true },
      });

      return { event: createdEvent, slot: createdSlot, ticket: createdTicket };
    });

    const fixture: ToctouFixture = {
      eventSlug,
      eventId: event.id,
      ticketId: ticket.id,
      slotId: slot.id,
    };
    console.log(JSON.stringify(fixture));
  } finally {
    await disconnect();
  }
}

async function countRegistrations(eventId: string): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    const [confirmed, total] = await Promise.all([
      prisma.eventRegistration.aggregate({
        where: {
          eventId,
          status: RegistrationStatus.CONFIRMED,
        },
        _count: { _all: true },
        _sum: { quantity: true },
      }),
      prisma.eventRegistration.count({ where: { eventId } }),
    ]);

    const result: CountResult = {
      eventId,
      confirmedCount: confirmed._count._all,
      confirmedSumQuantity: confirmed._sum.quantity ?? 0,
      totalCount: total,
    };
    console.log(JSON.stringify(result));
  } finally {
    await disconnect();
  }
}

async function main(): Promise<void> {
  const [subcommand, arg] = process.argv.slice(2);

  if (subcommand === undefined) {
    await createFixture();
    return;
  }

  if (subcommand === "count") {
    if (arg === undefined || arg.length === 0) {
      throw new Error("count サブコマンドには eventId 引数が必要です");
    }
    await countRegistrations(arg);
    return;
  }

  throw new Error(`未知のサブコマンド: ${subcommand}`);
}

try {
  await main();
} catch (error) {
  console.error(
    "create-toctou-capacity-one-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
