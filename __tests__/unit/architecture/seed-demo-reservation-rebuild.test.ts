import { describe, expect, test } from "bun:test";

import {
  collectNowRelativeReservationSeeders,
  type SeedReservationSeeder,
} from "../../helpers/seed-reservation-seeders";

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
 * ## 対象（監査 A-47）
 *
 * 抽出は `seedReservations` 固定だった。そのため `seedDevCustomerAndReservations`
 * が skip 方式のまま残っても緑で、`daysOffset: 7` / `16` の E2E fixture が
 * 古びていた。今は「now 相対で予約を作る関数」を性質で集めるので、
 * **片方だけ直った状態が緑にならない**。
 *
 * ## 何を強制するか
 *
 * 1. 作成前に既存行を `deleteMany` している（＝作り直している）
 * 2. 会計証跡（Receipt / Refund）を持つ行は削除対象から外している
 * 3. 「あれば skip」する分岐へ逆戻りしていない
 * 4. 削除が作成より**前**にある（EXCLUDE 制約は DEFERRABLE ではないので順序が正しさ）
 */

function seeders(): SeedReservationSeeder[] {
  const found = collectNowRelativeReservationSeeders();
  // 走査規模の下限。切り出しが壊れて 0 件になったら、以下の assertion は
  // 全部「違反なし」で緑になってしまう。
  expect(found.length).toBeGreaterThan(1);
  return found;
}

describe("now 相対で作る予約 seed の再構築", () => {
  test("対象は seedReservations と seedDevCustomerAndReservations", () => {
    expect(
      seeders()
        .map((seeder) => seeder.name)
        .sort(),
    ).toEqual(["seedDevCustomerAndReservations", "seedReservations"]);
  });

  test("作成前に既存の行を削除している", () => {
    for (const { name, body } of seeders()) {
      // 作り直しは advisory lock 付きの単一 tx 内で行うので client は `tx`
      // （順序と lock の検証は `seed-reservation-rebuild-safety.test.ts`）。
      expect({
        name,
        deletes: body.includes("tx.reservation.deleteMany("),
        creates: body.includes("tx.reservation.create("),
      }).toEqual({ name, deletes: true, creates: true });

      // 順序が正しさの一部。EXCLUDE 制約 `reservations_no_active_time_overlap_excl` は
      // DEFERRABLE ではないため、作ってから消す順序だと自分自身と衝突しうる。
      expect(body.indexOf("tx.reservation.deleteMany(")).toBeLessThan(
        body.indexOf("tx.reservation.create("),
      );
    }
  });

  test("会計証跡を持つ行は削除対象から外している", () => {
    for (const { name, body } of seeders()) {
      // Receipt / Refund は `onDelete: Restrict`。消せないだけでなく消してはいけない。
      expect({
        name,
        receipt: body.includes("receipt: { select: { id: true } }"),
        refunds: /refunds:\s*\{\s*select:\s*\{\s*id:\s*true\s*\}/u.test(body),
        combined: /receipt !== null \|\|[\s\S]{0,120}refunds\.length > 0/u.test(
          body,
        ),
      }).toEqual({ name, receipt: true, refunds: true, combined: true });
    }
  });

  test("「あれば skip」する分岐へ戻っていない", () => {
    for (const { name, body } of seeders()) {
      // 旧実装は 3 形あった。どれも「古いまま貼り付く」原因そのもの。
      //   seedReservations:               findFirst({ notes: { startsWith: marker } })
      //   seedDevCustomerAndReservations: findFirst({ customerId, notes }) + continue
      //   同じ関数内の guest merge fixture: findFirst の結果で if (!existing) 分岐
      //
      // 個別の形を追いかけると必ず 4 形目が出るので、**作り直しの形自体**を
      // 見る。作り直しは advisory lock 付き tx の中でしかできないので、
      // この関数群の予約作成は全部 `tx.` 経由でなければならない。
      // 素の `prisma.reservation.create(` が 1 つでもあれば skip 形が残っている。
      expect({
        name,
        startsWithMarkerSkip:
          /findFirst\(\{\s*where:\s*\{\s*notes:\s*\{\s*startsWith:\s*marker/u.test(
            body,
          ),
        createOutsideTx: body.includes("prisma.reservation.create("),
        skippedLog: body.includes("Skipped existing reservation"),
      }).toEqual({
        name,
        startsWithMarkerSkip: false,
        createOutsideTx: false,
        skippedLog: false,
      });
    }
  });

  test("削除対象を特定するキーが宣言から導出されている", () => {
    for (const { name, body } of seeders()) {
      // 消してよいのは「seed が作ったと証明できる行」だけ。キーはエントリ宣言
      // そのものから導出する（手書きの allowlist へ戻さない）。
      expect({
        name,
        declaredNotes: /declared\w*Notes\s*=\s*\[\s*\.\.\.new Set\(/u.test(
          body,
        ),
      }).toEqual({ name, declaredNotes: true });
    }

    // marker は `seedReservations` 側の追加キー（デモ scope の取りこぼし防止）。
    const demo = seeders().find(
      (seeder) => seeder.name === "seedReservations",
    )?.body;
    expect(demo).toContain("startsWith: SEED_DEMO_RESERVATION_MARKER");
  });
});
