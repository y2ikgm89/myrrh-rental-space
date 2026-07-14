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
 * E2E fixture: 満員（sold-out）のイベントを 1 件作成し、
 *   - 定員を埋める CONFIRMED 申込 1 件（無関係なゲスト）
 *   - dev customer（`dev-customer@example.com`）の WAITLISTED 申込 1 件
 * を併せて作成する。
 *
 * `e2e/authenticated/customer/waitlist.spec.ts` から
 * `execFile("bun", [thisScript], { env: process.env })` で呼ばれる
 * （`create-claim-event-registration-fixture.ts` と同じ「Playwright test から
 * bun script を子プロセス実行する」パターン）。
 *
 * ## なぜ実 UI の waitlist 登録フォーム送信を経由しないか
 *
 * `registerForEventWaitlist` Server Action は Turnstile 検証を必須で通過する。
 * E2E 環境は Cloudflare の "always passes" テストキーを使うが、実ウィジェット
 * ロード + `challenges.cloudflare.com` への実ネットワーク呼び出しに依存するため
 * CI での flake risk がある。既存の `reservation-cancel-flow.spec.ts`
 * （「実 click は dev Turnstile + seed 依存で flake risk」）や
 * `mypage-profile-flow.spec.ts`（「実 update action は dev Turnstile + DB write
 * を伴うため...smoke に集中する」）も同じ理由で Turnstile 必須アクションの実
 * click を避け、「UI smoke（ボタン/フォーム存在確認）+ 実データは fixture 直接
 * 作成」に分割している。本 fixture もその方針を踏襲し、waitlist 登録済み状態を
 * 直接 DB に作る（`registerWaitlistEntryCommand` 自体の DB 挙動は
 * `event-waitlist-register.test.ts` の実 DB 統合テストが担保する）。
 *
 * ## dev customer の解決について
 *
 * `prisma/seed.ts` の `seedDevCustomerAndReservations()` が webServer 起動の
 * migrate → seed ステップで必ず作成する（`e2e/auth/customer.setup.ts` が
 * ログインする対象と同一）。本 fixture はメールアドレスで Customer 行を検索し、
 * その `id` を waitlist 申込の `customerId` に使う（`/mypage/events` に表示
 * させるため）。
 */

process.env["DATABASE_URL"] = resolveTestDatabaseUrl(
  process.env["TEST_DATABASE_URL"],
).url;

const DEV_CUSTOMER_EMAIL = "dev-customer@example.com";

interface WaitlistTestFixture {
  readonly eventSlug: string;
  readonly eventTitle: string;
  readonly eventId: string;
  readonly waitlistedRegistrationId: string;
}

async function main(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    const devCustomer = await prisma.customer.findFirst({
      where: { email: DEV_CUSTOMER_EMAIL },
      select: { id: true },
    });
    if (!devCustomer) {
      throw new Error(
        `dev customer (${DEV_CUSTOMER_EMAIL}) が見つかりません。seed が未実行の可能性があります。`,
      );
    }

    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const eventTitle = `E2Eキャンセル待ちテスト ${unique}`;
    const eventSlug = `e2e-waitlist-test-${unique}`;
    const descriptionText = "E2E waitlist テスト用イベントです。";
    const descriptionJsonString =
      buildParagraphEditorStateJson(descriptionText);
    const descriptionHtml = buildParagraphHtml(descriptionText);

    // 過去/既存 seed データと重ならない、十分未来の固定枠
    // (create-claim-event-registration-fixture.ts と同じ日付を再利用)
    const startAt = new Date("2027-04-20T01:00:00.000Z");
    const endAt = new Date("2027-04-20T03:00:00.000Z");

    // Event.scheduleMode = SINGLE_OCCURRENCE は DB の DEFERRABLE constraint
    // trigger（`events_schedule_integrity_check`）で「ちょうど1つの
    // EventTimeSlot を持つこと」をトランザクションコミット時に検証するため、
    // Event + EventTimeSlot は同一 interactive transaction 内で作成する
    // （`create-claim-event-registration-fixture.ts` と同じ理由）。
    const { event, slot, ticket } = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.event.create({
        data: {
          title: eventTitle,
          slug: eventSlug,
          descriptionJson: parsePrismaInputJson(
            descriptionJsonString,
            "e2e waitlist fixture description JSON が不正です",
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
          // capacity: 1 + 下で CONFIRMED 申込を1件先に作ることで sold-out にする
          // (derivePublicEventRegistrationState の "waitlist-available" 判定)。
          capacity: 1,
        },
        select: { id: true },
      });

      const createdTicket = await tx.eventTicket.create({
        data: {
          eventId: createdEvent.id,
          name: "一般",
          // 無料チケット: waitlist 申込の Stripe checkout 分岐を回避し
          // FIFO / cancel の UI smoke に集中する。
          price: 0,
        },
        select: { id: true },
      });

      return { event: createdEvent, slot: createdSlot, ticket: createdTicket };
    });

    // 定員を埋める CONFIRMED 申込（無関係なゲスト）
    await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        slotId: slot.id,
        ticketId: ticket.id,
        name: "既存参加者",
        email: `e2e-waitlist-filler-${unique}@example.com`,
        quantity: 1,
        status: RegistrationStatus.CONFIRMED,
      },
    });

    // dev customer の WAITLISTED 申込（マイページ表示 + キャンセル UI smoke 用）
    const waitlisted = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        slotId: slot.id,
        ticketId: ticket.id,
        name: "開発テスト",
        email: DEV_CUSTOMER_EMAIL,
        quantity: 1,
        status: RegistrationStatus.WAITLISTED,
        waitlistedAt: new Date(),
        customerId: devCustomer.id,
      },
      select: { id: true },
    });

    const fixture: WaitlistTestFixture = {
      eventSlug,
      eventTitle,
      eventId: event.id,
      waitlistedRegistrationId: waitlisted.id,
    };

    console.log(JSON.stringify(fixture));
  } finally {
    await disconnect();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    "❌ create-waitlist-test-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
