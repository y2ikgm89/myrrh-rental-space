/**
 * blocked_dates の scope discriminated-union CHECK 制約の存在を検証する統合テスト（実 DB 必須）。
 *
 * `blocked_dates_scope_target_check`（migration 20260528173132）は
 * SPACE→spaceId 必須 / LOCATION→locationId 必須 / GLOBAL→両方 null の不変条件を DB 層で
 * 強制する。Prisma schema DSL では表現できず、`prisma db pull` は CHECK 制約を黙って落とすため、
 * introspection 由来の schema 再生成等で制約が失われる回帰を機械的に検出する。
 *
 * == 実行条件 ==
 * `TEST_DATABASE_URL` 設定時のみ実行（未設定なら describe ごと skip。dev DB 誤汚染防止）。
 * gateway は import 時の `process.env.DATABASE_URL` を読むため動的 import より前に上書きする。
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";

const TEST_DB_URL = process.env["TEST_DATABASE_URL"];
if (TEST_DB_URL) {
  process.env["DATABASE_URL"] = TEST_DB_URL;
}

const describeMaybe = TEST_DB_URL ? describe : describe.skip;

type PrismaModule = typeof import("@/shared/db/prisma");

let prisma: PrismaModule["prisma"];
let basePrisma: PrismaModule["basePrisma"];

describeMaybe("blocked_dates scope CHECK 制約", () => {
  beforeAll(async () => {
    ({ prisma, basePrisma } = await import("@/shared/db/prisma"));
  });

  afterAll(async () => {
    await basePrisma.$disconnect();
  });

  test("CHECK 制約 blocked_dates_scope_target_check が DB に存在する（db pull で消えていない）", async () => {
    const rows = await prisma.$queryRaw<{ contype: string }[]>`
      SELECT contype::text AS contype
      FROM pg_constraint
      WHERE conname = 'blocked_dates_scope_target_check'
    `;

    // 制約が 1 件存在し、種別が CHECK（'c'）であること。
    expect(rows.length).toBe(1);
    expect(rows[0]?.contype).toBe("c");
  });
});
