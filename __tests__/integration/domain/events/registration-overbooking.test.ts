/**
 * イベント申込の定員チェック TOCTOU オーバーセル競合の統合テスト（実 DB 必須）。
 *
 * `createEventRegistrationCommand` は「CONFIRMED 申込の quantity 合計を集計 →
 * 残枠を計算 → create」を行う。これがトランザクション外の独立クエリだと、最後の
 * 1 枠に同時申込が殺到したとき複数リクエストが同じ残枠を読んで全部チェックを通過し、
 * `event.capacity` / `ticket.capacity` を超過する（overbooking）。本テストは実際に
 * N 並行で同一イベントの最後の 1 枠を奪い合わせ、CONFIRMED 合計が capacity を
 * 超えないことを検証する。
 *
 * == 実行条件 ==
 * 本テストは mock ではなく **実 Postgres** を要求する（advisory lock /
 * トランザクションの直列化挙動は mock では再現不能なため）。`bun run test:integration`
 * は docker-compose の test-db 既定値を注入する。直接 `bun test` でこのファイルを
 * 実行し `TEST_DATABASE_URL` が未設定の場合のみ describe ごと skip する（dev DB を
 * 誤って汚染しないための安全弁）。
 *
 *   ローカル: `bun run test:integration` が
 *     postgresql://postgres:postgres@localhost:5433/myrrh_test?schema=public
 *   を既定値として使い、docker-compose test-db を起動する。
 *   CI: `unit-tests` job が postgres service + `prisma migrate deploy` 済みのため
 *   `TEST_DATABASE_URL` を渡すだけで実行される。
 *
 * `@/shared/db/prisma` gateway は `serverEnv.DATABASE_URL`（= モジュール初回
 * import 時の `process.env.DATABASE_URL` スナップショット）を読むため、gateway を
 * 動的 import する **前** に `DATABASE_URL` を `TEST_DATABASE_URL` で上書きする。
 */

import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";
import {
  EventScheduleMode,
  EventStatus,
  RegistrationStatus,
} from "@generated/prisma/enums";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す（静的 import は gateway を引かないため、
// この代入は動的 import より先に実行される）。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

// `createEventRegistrationCommand` は `isFeatureEnabled("events")` を直接呼ぶ
// （reviews/commands.ts と同型の feature module gate）。実装は 'use cache' 付きの
// Settings 読取りを経由するが、この real-DB テストは advisory lock の直列化検証が
// 目的でありテスト DB の Settings シーディングとは無関係なため、他の unit テストと
// 同じ mock パターンで gate 自体をバイパスする。
mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: () => Promise.resolve(true),
}));

// 動的 import の型（gateway / command を実行時に読み込む）
type PrismaModule = typeof import("@/shared/db/prisma");
type CommandsModule =
  typeof import("@/shared/domain/events/registration-commands");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let createEventRegistrationCommand: CommandsModule["createEventRegistrationCommand"];

/** capacity を指定して PUBLISHED イベント + タイムスロット + 受付中チケットを 1 件作る。 */
async function createTestEvent(opts: {
  eventCapacity: number | null;
  ticketCapacity: number | null;
}): Promise<{ eventId: string; ticketId: string; slotId: string }> {
  const suffix = crypto.randomUUID();
  const start = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const end = new Date(Date.now() + 26 * 60 * 60 * 1000);

  return prisma.$transaction(async (tx) => {
    const event = await tx.event.create({
      data: {
        title: "Overbooking TOCTOU Test",
        slug: `overbooking-toctou-${suffix}`,
        descriptionJson: { type: "doc" },
        descriptionHtml: "<p>test</p>",
        descriptionPlainText: "test",
        status: EventStatus.PUBLISHED,
        scheduleMode: EventScheduleMode.SINGLE_OCCURRENCE,
        registrationOpen: true,
        // 本番不変条件 (PUBLISHED + slot あり → 非 NULL) に整合させるため明示注入
        firstSlotStartAt: start,
        lastSlotEndAt: end,
      },
      select: { id: true },
    });

    // スロット定員: eventCapacity を使う場合はその値、ticketCapacity 専用なら大きな数
    const slotCapacity = opts.eventCapacity ?? 1000;
    const slot = await tx.eventTimeSlot.create({
      data: {
        eventId: event.id,
        startAt: start,
        endAt: end,
        capacity: slotCapacity,
      },
      select: { id: true },
    });

    const ticket = await tx.eventTicket.create({
      data: {
        eventId: event.id,
        name: "一般",
        price: 0,
        capacity: opts.ticketCapacity,
        isAvailable: true,
      },
      select: { id: true },
    });

    return { eventId: event.id, ticketId: ticket.id, slotId: slot.id };
  });
}

/** テストイベントとその子レコードを削除する（restrict 回避のため順序固定）。 */
async function cleanupEvent(eventId: string): Promise<void> {
  await prisma.eventRegistration.deleteMany({ where: { eventId } });
  await prisma.eventTicket.deleteMany({ where: { eventId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
}

/** 同一イベント・同一スロット・同一チケットに quantity=1 の申込を N 並行で投げる。 */
async function registerConcurrently(
  eventId: string,
  ticketId: string,
  slotId: string,
  count: number,
): Promise<PromiseSettledResult<unknown>[]> {
  return Promise.allSettled(
    Array.from({ length: count }, (_unused, i) =>
      createEventRegistrationCommand({
        eventId,
        slotId,
        ticketId,
        name: `テスト太郎${String(i)}`,
        email: `overbooking-${String(i)}@example.com`,
        quantity: 1,
      }),
    ),
  );
}

/** CONFIRMED 申込の quantity 合計を返す。 */
async function confirmedQuantitySum(eventId: string): Promise<number> {
  const agg = await prisma.eventRegistration.aggregate({
    where: { eventId, status: RegistrationStatus.CONFIRMED },
    _sum: { quantity: true },
  });
  return agg._sum.quantity ?? 0;
}

const CONCURRENCY = 5;

describeMaybe("createEventRegistrationCommand — TOCTOU overbooking", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ createEventRegistrationCommand } =
      await import("@/shared/domain/events/registration-commands"));
    // フルパス（aggregate + create）を **並行バースト** でウォームアップする。
    // プロセス内で最初の並行バーストだけは、接続ごとの prepared-statement キャッシュ
    // 構築・pg プールの遅延接続確立でクエリがずれ、競合が偶発的に直列化して隠れる
    // （順序効果。1 本目の並行テストだけ overbooking しないことを実測で確認）。
    // 容量に余裕のある捨てイベントへ CONCURRENCY 並行で申込を流して経路を温めておく
    // ことで、本体の並行テストで TOCTOU を決定的に再現させる。
    const warmup = await createTestEvent({
      eventCapacity: null,
      ticketCapacity: null,
    });
    await registerConcurrently(
      warmup.eventId,
      warmup.ticketId,
      warmup.slotId,
      CONCURRENCY,
    );
    await cleanupEvent(warmup.eventId);
  });

  afterAll(async () => {
    // 実 DB 接続をクローズしてサブプロセスをハングさせない。
    await basePrisma.$disconnect();
  });

  test("event.capacity=1 に 5 並行申込しても CONFIRMED 合計は capacity を超えない", async () => {
    const { eventId, ticketId, slotId } = await createTestEvent({
      eventCapacity: 1,
      ticketCapacity: null,
    });

    try {
      const results = await registerConcurrently(
        eventId,
        ticketId,
        slotId,
        CONCURRENCY,
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // 核心の不変条件：CONFIRMED 合計が capacity を超えてはならない。
      expect(await confirmedQuantitySum(eventId)).toBe(1);
      // 1 件だけ成功し、残りは満員で弾かれる。
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(CONCURRENCY - 1);
    } finally {
      await cleanupEvent(eventId);
    }
  }, 30_000);

  test("ticket.capacity=1 に 5 並行申込しても CONFIRMED 合計は capacity を超えない", async () => {
    const { eventId, ticketId, slotId } = await createTestEvent({
      eventCapacity: null,
      ticketCapacity: 1,
    });

    try {
      const results = await registerConcurrently(
        eventId,
        ticketId,
        slotId,
        CONCURRENCY,
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(await confirmedQuantitySum(eventId)).toBe(1);
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(CONCURRENCY - 1);
    } finally {
      await cleanupEvent(eventId);
    }
  }, 30_000);
});
