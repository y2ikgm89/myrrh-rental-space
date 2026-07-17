/**
 * `lockReservationSeriesForTransaction`（advisory lock 728357、series 単位）の統合テスト（実 DB 必須）。
 *
 * ReservationSeries 作成・一括キャンセルは複数 instance への書込を伴うため、同一
 * series への並行操作を interactive tx 単位でシリアライズする必要がある
 * （`.claude/rules/db-domain.md` advisory lock registry 728357、
 * `src/shared/domain/reservations/series-advisory-lock.ts`）。
 *
 * 本テストは実 Postgres 上で同一 key に対する 2 並行 tx を投げ、後発 tx の
 * lock 取得が先発 tx の完了後になる（= 直列化されている）ことを検証する
 * （space-overlap-concurrency.test.ts の advisory lock 検証と同型）。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（未設定なら describe ごと skip）。gateway は
 * import 時の `process.env.DATABASE_URL` を読むため、動的 import より前に上書きする。
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");
type SeriesLockModule =
  typeof import("@/shared/domain/reservations/series-advisory-lock");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];
let lockReservationSeriesForTransaction: SeriesLockModule["lockReservationSeriesForTransaction"];

describeMaybe("lockReservationSeriesForTransaction (integration)", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
    ({ lockReservationSeriesForTransaction } =
      await import("@/shared/domain/reservations/series-advisory-lock"));
    // 接続プールをウォームアップ（コールドスタートが並行クエリをずらして race を隠すのを防ぐ）。
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("同一 key で 2 並列 tx を直列化", async () => {
    const key = `test-series-${Date.now()}`;
    const events: string[] = [];

    const t1 = prisma.$transaction(async (tx) => {
      await lockReservationSeriesForTransaction(tx, key);
      events.push("t1-locked");
      await new Promise((r) => setTimeout(r, 200));
      events.push("t1-done");
    });

    // t1 が lock 取得後、少し待って t2 を start
    await new Promise((r) => setTimeout(r, 50));

    const t2 = prisma.$transaction(async (tx) => {
      events.push("t2-start");
      await lockReservationSeriesForTransaction(tx, key);
      events.push("t2-locked");
    });

    await Promise.all([t1, t2]);

    // t1 が終わってから t2 が lock 取得
    const t1Done = events.indexOf("t1-done");
    const t2Locked = events.indexOf("t2-locked");
    expect(t2Locked).toBeGreaterThan(t1Done);
  }, 10_000);
});
