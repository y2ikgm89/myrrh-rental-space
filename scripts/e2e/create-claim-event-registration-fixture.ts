import { createScriptPrismaClient } from "../_shared/script-prisma";
import { resolveTestDatabaseUrl } from "../test-db-url";

/**
 * E2E fixture: 未紐付け（`EventRegistration.customerId: null`）のゲストイベント
 * 参加申込を1件（Event / EventTimeSlot / EventTicket も併せて）作成し、その申込の
 * claim トークン付き URL を stdout に JSON で出力する。
 *
 * `e2e/authenticated/customer/claim-event-registration.spec.ts` から
 * `execFile("bun", [thisScript], { env: process.env })` で呼ばれる
 * （`create-claim-reservation-fixture.ts` と同じ「Playwright test から bun script を
 * 子プロセス実行する」パターン）。
 *
 * ## なぜ Playwright test ファイル内で直接 import しないか
 *
 * `createEventRegistrationClaimToken` は `@/shared/lib/crypto` を経由して
 * `@/shared/lib/env/server.ts` の `serverEnv`（module load 時に Zod でパース）に
 * 依存する。`serverEnv` は `DATABASE_URL` / `BETTER_AUTH_SECRET` を必須とするため、
 * このモジュールを import する前に、`playwright.config.ts` の `webServer.env` と
 * **同じ解決ロジック**（`resolveTestDatabaseUrl` + 固定フォールバック値）で
 * 環境変数を用意しておく必要がある。子プロセスへ切り出すことで、Playwright
 * テストプロセス自身の `process.env`（サーバー起動用の env とは無関係）を汚さず、
 * この一時的な env 上書きをこのスクリプトの中に閉じ込める。
 *
 * ## 暗号鍵の一致について
 *
 * `create-claim-reservation-fixture.ts` と同じ注記を参照。ここで解決する
 * `DATABASE_URL` / `BETTER_AUTH_SECRET` / `ENCRYPTION_KEY` のフォールバック値は
 * `playwright.config.ts` / CI の "Run E2E tests" step の env と完全に同じ式・
 * 同じ固定値を使う。値がどちらかだけ変わった場合はこのファイルも合わせて更新すること。
 */

process.env["DATABASE_URL"] = resolveTestDatabaseUrl(
  process.env["TEST_DATABASE_URL"],
).url;

process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] &&
  process.env["BETTER_AUTH_SECRET"].length >= 32
    ? process.env["BETTER_AUTH_SECRET"]
    : "local-e2e-better-auth-secret-000000";

process.env["ENCRYPTION_KEY"] = process.env["ENCRYPTION_KEY"] || "0".repeat(64);

// `event-registration-claim-token.ts`（および経由する crypto.ts / env/encryption.ts）は
// `import "server-only"` を持つ。`server-only` パッケージは webpack エイリアス無しで
// 読み込まれると常に throw する実装のため（Next.js のバンドラー内でのみ no-op 化される）、
// bun test の preload（`__tests__/setup.ts`）と同じ意図で `Bun.plugin` により
// このスクリプトの実行時だけ `server-only` を no-op モジュールに差し替える。
Bun.plugin({
  name: "stub-server-only",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
  },
});

// `event-registration-claim-token.ts` は `@/shared/lib/env/server.ts`(serverEnv) を
// module load 時に Zod パースするため、上記の env 上書き後に動的 import する。
const { createEventRegistrationClaimToken } =
  await import("@/shared/lib/event-registration-claim-token");
const { EventScheduleMode, EventStatus } =
  await import("../../generated/prisma/client");
const { buildParagraphEditorStateJson, buildParagraphHtml } =
  await import("@/shared/lib/lexical/description-defaults");
const { stripHtmlToText } =
  await import("@/shared/lib/lexical/html-to-plain-text");
const { parsePrismaInputJson } = await import("@/shared/db/prisma-input-json");

async function main(): Promise<void> {
  const { prisma, disconnect } = createScriptPrismaClient();

  try {
    const unique = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
    const eventTitle = `E2E Claimイベント ${unique}`;
    const eventSlug = `e2e-claim-event-${unique}`;
    const descriptionHtml = buildParagraphHtml(
      "E2E claim テスト用イベントです。",
    );

    // 過去/既存 seed データと重ならない、十分未来の固定枠を使う
    // （直接 Prisma insert のため定員チェックは走らない）。
    const startAt = new Date("2027-04-20T01:00:00.000Z");
    const endAt = new Date("2027-04-20T03:00:00.000Z");

    // Event.scheduleMode = SINGLE_OCCURRENCE は DB の DEFERRABLE constraint trigger
    // （`events_schedule_integrity_check`、baseline migration 由来）で
    // 「ちょうど1つの EventTimeSlot を持つこと」をトランザクションコミット時に検証する。
    // Event 単体・EventTimeSlot 単体を別々の auto-commit 文で作ると、Event 作成の
    // コミット時点でまだスロットが無く即座に違反するため、`seed.ts` と同じく
    // interactive transaction 内でまとめて作成する。
    const { event, slot, ticket } = await prisma.$transaction(async (tx) => {
      const createdEvent = await tx.event.create({
        data: {
          title: eventTitle,
          slug: eventSlug,
          descriptionJson: parsePrismaInputJson(
            buildParagraphEditorStateJson("E2E claim テスト用イベントです。"),
            "e2e fixture description JSON が不正です",
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
          capacity: 10,
        },
        select: { id: true },
      });

      const createdTicket = await tx.eventTicket.create({
        data: {
          eventId: createdEvent.id,
          name: "一般",
          price: 1000,
          unitSize: 1,
          sortOrder: 0,
          isAvailable: true,
        },
        select: { id: true },
      });

      return { event: createdEvent, slot: createdSlot, ticket: createdTicket };
    });

    const guestEmail = `e2e-claim-event-guest-${unique}@example.com`;

    const registration = await prisma.eventRegistration.create({
      data: {
        eventId: event.id,
        slotId: slot.id,
        ticketId: ticket.id,
        name: "クレームE2Eゲスト",
        email: guestEmail,
        quantity: 1,
        customerId: null,
      },
      select: { id: true },
    });

    const token = createEventRegistrationClaimToken(registration.id);

    console.log(
      JSON.stringify({
        eventRegistrationId: registration.id,
        eventTitle,
        token,
      }),
    );
  } finally {
    await disconnect();
  }
}

try {
  await main();
} catch (error) {
  console.error(
    "❌ create-claim-event-registration-fixture failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
}
