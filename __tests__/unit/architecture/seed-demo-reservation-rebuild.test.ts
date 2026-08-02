import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * デモ予約が**毎 run 作り直される**ことを機械強制する gate。
 *
 * ## なぜ「作り直す」でなければならないのか
 *
 * デモ予約のエントリは `daysOffset` で **`now` からの相対**に置かれる。
 * 「既にあれば skip」にすると、行は初回 seed の暦日に貼り付いたまま古びる。
 * 実測（2026-08-02 のローカル test DB）: `daysOffset: 0`（「本日のご予約」）の
 * 行が全部 **2026-06-03**、marker 行全体でも 2026-06-03〜07-30 で、
 * **未来のデモ予約が 1 件も無い** DB になっていた。
 * 管理画面のカレンダー・ダッシュボードの「本日」「今後の予約」は全部空になる。
 *
 * また marker 導入**前**に作られた行は marker を持たない。skip 方式だと既存 DB では
 * 全エントリが「無い」と判定され、COMPLETED / CANCELLED（EXCLUDE 制約の対象外）は
 * 重複が増え続け、PENDING / CONFIRMED は旧行と重なって毎回 skip されるので
 * **永久に収束しない**。実測: marker 行 20 件と marker 無しの旧デモ行が併存していた。
 *
 * ## 何を強制するか
 *
 * 1. 作成前に既存デモ予約を `deleteMany` している（＝作り直している）
 * 2. 会計証跡（Receipt / Refund）を持つ行は削除対象から外している
 * 3. marker 一致で「あれば skip」する分岐へ逆戻りしていない
 * 4. 削除が作成より**前**にある（EXCLUDE 制約は DEFERRABLE ではないので順序が正しさ）
 */

const SEED = join(process.cwd(), "prisma/seed.ts");

function seedReservationsBody(): string {
  const source = readFileSync(SEED, "utf8");
  const match = /async function seedReservations\(\)[\s\S]*?\n\}/u.exec(source);
  if (!match) {
    throw new Error("seedReservations が見つかりません");
  }
  return match[0];
}

describe("デモ予約の再構築", () => {
  test("作成前に既存のデモ予約を削除している", () => {
    const body = seedReservationsBody();

    expect(body).toContain("prisma.reservation.deleteMany(");
    expect(body).toContain("prisma.reservation.create(");

    // 順序が正しさの一部。EXCLUDE 制約 `reservations_no_active_time_overlap_excl` は
    // DEFERRABLE ではないため、作ってから消す順序だと自分自身と衝突しうる。
    expect(body.indexOf("prisma.reservation.deleteMany(")).toBeLessThan(
      body.indexOf("prisma.reservation.create("),
    );
  });

  test("会計証跡を持つ行は削除対象から外している", () => {
    const body = seedReservationsBody();

    // Receipt / Refund は `onDelete: Restrict`。消せないだけでなく消してはいけない。
    expect(body).toContain("receipt: { select: { id: true } }");
    expect(body).toMatch(/refunds:\s*\{\s*select:\s*\{\s*id:\s*true\s*\}/u);
    expect(body).toMatch(
      /receipt !== null \|\|[\s\S]{0,80}refunds\.length > 0/u,
    );
  });

  test("marker 一致で skip する分岐へ戻っていない", () => {
    const body = seedReservationsBody();

    // 旧実装: `findFirst({ where: { notes: { startsWith: marker } } })` の有無で
    // create を分岐していた。これが「古いまま貼り付く」原因そのもの。
    expect(body).not.toMatch(
      /findFirst\(\{\s*where:\s*\{\s*notes:\s*\{\s*startsWith:\s*marker/u,
    );
    expect(body).not.toContain("Skipped existing reservation");
  });

  test("marker 自体は残っている（削除対象の特定キー）", () => {
    const body = seedReservationsBody();

    // 削除の第 1 条件が marker。消すと「seed が作った行」を特定できなくなり、
    // デモ scope の判定が customer × space だけになって取りこぼす。
    expect(body).toContain("startsWith: SEED_DEMO_RESERVATION_MARKER");
  });
});
