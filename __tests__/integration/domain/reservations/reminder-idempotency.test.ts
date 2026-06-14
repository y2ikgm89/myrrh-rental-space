/**
 * 予約リマインダー cron の冪等性（重複メール送信防止）の統合テスト（実 DB 必須）。
 *
 * Cloud Scheduler は at-least-once 配信で、ジョブのリトライや手動再実行で同一 cron が
 * 二重起動しうる。`findReservationsForReminderWindow → 送信 → reminderSentAt 更新` の
 * 素朴な流れでは、並行する 2 実行が同じ `reminderSentAt: null` の予約を読み取り双方が
 * 送信する race window が残る。本テストは、送信前の atomic claim
 * （`claimReservationReminder` の `updateMany({ where: { reminderSentAt: null } })`）が
 * 実 Postgres 上でこの race を構造的に閉じることを検証する:
 *
 *   1. 連続実行: 初回 claim のみ true、2 回目以降は false（= 2 回目は 0 件送信）。
 *   2. 並行二重起動: N 並行 claim でも勝者はちょうど 1 つ。
 *   3. 送信失敗時の release: release 後は再び claim できる（次回 cron で再送可能）。
 *   4. クエリ段の dedup: claim 済み予約は `findReservationsForReminderWindow` から除外される。
 *
 * == 実行条件 ==
 * 実 Postgres を要求する（atomic UPDATE の直列化挙動は mock では再現不能）。
 * `TEST_DATABASE_URL` が設定されているときのみ実行し、未設定なら describe ごと skip する
 * （開発者の dev DB を誤って汚染しないための安全弁）。`registration-overbooking.test.ts`
 * と同じ規約。
 *
 *   ローカル: 専用テスト DB を用意し、
 *     TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/myrrh_test
 *   を設定して `bun run test:integration` を実行する。
 *   CI: `unit-tests` job が postgres service + `prisma migrate deploy` 済みのため
 *   `TEST_DATABASE_URL` を渡すだけで実行される。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ReservationStatus } from "@generated/prisma/enums";

// グローバル preload (__tests__/setup.ts) は DATABASE_URL をダミー値に固定する。
// gateway を読む前に実テスト DB へ向け直す（静的 import は gateway を引かないため、
// この代入は動的 import より先に実行される）。
const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type ReminderCommandsModule =
  typeof import("@/shared/domain/reservations/reminder-commands");
type AdminQueriesModule =
  typeof import("@/shared/domain/reservations/admin-queries");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let claimReservationReminder: ReminderCommandsModule["claimReservationReminder"];
let releaseReservationReminderClaim: ReminderCommandsModule["releaseReservationReminderClaim"];
let findReservationsForReminderWindow: AdminQueriesModule["findReservationsForReminderWindow"];

type Fixture = {
  reservationId: string;
  cleanup: () => Promise<void>;
};

/** Location → Space → Customer → Reservation を 1 件ずつ作る最小 fixture。 */
async function createReservationFixture(opts?: {
  startTime?: Date;
  status?: ReservationStatus;
}): Promise<Fixture> {
  const suffix = crypto.randomUUID();
  const startTime =
    opts?.startTime ?? new Date(Date.now() + 24 * 60 * 60 * 1000);
  const endTime = new Date(startTime.getTime() + 2 * 60 * 60 * 1000);

  const location = await prisma.location.create({
    data: {
      slug: `reminder-loc-${suffix}`,
      name: `Reminder Loc ${suffix}`,
      address: "東京都テスト区1-2-3",
      imageUrl: "https://example.com/loc.jpg",
    },
    select: { id: true },
  });

  const space = await prisma.space.create({
    data: {
      slug: `reminder-space-${suffix}`,
      name: `Reminder Space ${suffix}`,
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

  const customer = await prisma.customer.create({
    data: {
      lastName: "山田",
      firstName: "太郎",
      email: `reminder-${suffix}@example.com`,
    },
    select: { id: true },
  });

  const reservation = await prisma.reservation.create({
    data: {
      spaceId: space.id,
      customerId: customer.id,
      startTime,
      endTime,
      status: opts?.status ?? ReservationStatus.CONFIRMED,
    },
    select: { id: true },
  });

  return {
    reservationId: reservation.id,
    cleanup: async () => {
      // FK 安全な順序（Space→Location は Restrict）
      await prisma.reservation.deleteMany({ where: { id: reservation.id } });
      await prisma.space.deleteMany({ where: { id: space.id } });
      await prisma.customer.deleteMany({ where: { id: customer.id } });
      await prisma.location.deleteMany({ where: { id: location.id } });
    },
  };
}

describeMaybe("claimReservationReminder — cron 冪等性", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ claimReservationReminder, releaseReservationReminderClaim } =
      await import("@/shared/domain/reservations/reminder-commands"));
    ({ findReservationsForReminderWindow } =
      await import("@/shared/domain/reservations/admin-queries"));
    // 接続プールをウォームアップ（コールドスタートが並行クエリをずらして race を隠すのを防ぐ）。
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("連続実行: 初回のみ claim でき、2 回目は false（2 回目は 0 件送信）", async () => {
    const { reservationId, cleanup } = await createReservationFixture();
    try {
      // 1 回目の cron 実行に相当
      expect(await claimReservationReminder(reservationId)).toBe(true);
      // 2 回目（リトライ / 手動再実行）— 既に claim 済みなので送信しない
      expect(await claimReservationReminder(reservationId)).toBe(false);
      expect(await claimReservationReminder(reservationId)).toBe(false);
    } finally {
      await cleanup();
    }
  });

  test("並行二重起動: 5 並行 claim でも勝者はちょうど 1 つ", async () => {
    const { reservationId, cleanup } = await createReservationFixture();
    try {
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          claimReservationReminder(reservationId),
        ),
      );
      const winners = results.filter((claimed) => claimed === true);
      expect(winners.length).toBe(1);
    } finally {
      await cleanup();
    }
  }, 30_000);

  test("送信失敗時の release 後は再び claim できる（再送可能）", async () => {
    const { reservationId, cleanup } = await createReservationFixture();
    try {
      expect(await claimReservationReminder(reservationId)).toBe(true);
      // 送信失敗をシミュレート → claim を解放
      await releaseReservationReminderClaim(reservationId);
      // 次回 cron 実行で再び claim できる
      expect(await claimReservationReminder(reservationId)).toBe(true);
    } finally {
      await cleanup();
    }
  });

  test("claim 済み予約は findReservationsForReminderWindow から除外される", async () => {
    const startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const { reservationId, cleanup } = await createReservationFixture({
      startTime,
    });
    try {
      const windowStart = new Date(startTime.getTime() - 60 * 60 * 1000);
      const windowEnd = new Date(startTime.getTime() + 60 * 60 * 1000);

      // claim 前は窓内に出現する
      const before = await findReservationsForReminderWindow(
        windowStart,
        windowEnd,
      );
      expect(before.some((r) => r.id === reservationId)).toBe(true);

      // claim 後（= 送信済み）は窓から除外される（2 回目の実行は 0 件）
      await claimReservationReminder(reservationId);
      const after = await findReservationsForReminderWindow(
        windowStart,
        windowEnd,
      );
      expect(after.some((r) => r.id === reservationId)).toBe(false);
    } finally {
      await cleanup();
    }
  });
});
