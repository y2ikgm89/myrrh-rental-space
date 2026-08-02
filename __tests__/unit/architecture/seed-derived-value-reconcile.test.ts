import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * **他の行から導出した値**を持つ seed が、既存行を skip せず毎回引き直すことを
 * 機械強制する gate。
 *
 * ## なぜ必要か
 *
 * 「既にあれば skip」は、その行が**自己完結**しているときだけ正しい。導出値を
 * 持つ行では、導出元が動いた瞬間に skip が「古い値を保存する」に変わる。
 *
 * 実例: `seedSpaceRatePlans` は `hourlyPrice` を `space.hourlyPrice × 1.3 / 1.5`
 * で作る。`seedSpaces` がスペース側を宣言値へ寄せ直すようになった（#1830）ので、
 * 先に作られたプランだけが古い基本料金由来の額のまま残る。
 * `e2e/smoke/rate-plan-preview.smoke.spec.ts` は税込の実額
 * 「¥1,430（税込）」= round(round(1,000 × 1.3) × 1.1) を assert する
 * **required gate** なので、この drift は必須ゲートの失敗として現れる。
 *
 * ## 何を強制するか
 *
 * 1. 導出値を持つ seed 関数が「無ければ作るだけ」で終わっていない
 * 2. 存在確認が `orderBy` 無しの `findFirst` になっていない
 *    （(spaceId, name) に unique が無いので、同名が複数あると掴む行が run ごとに変わる）
 */

const SEED = join(process.cwd(), "prisma/seed.ts");

function functionBody(name: string): string {
  const source = readFileSync(SEED, "utf8");
  const match = new RegExp(
    `async function ${name}\\(\\)[\\s\\S]*?\\n\\}`,
    "u",
  ).exec(source);
  if (!match) {
    throw new Error(`${name} が見つかりません`);
  }
  return match[0];
}

describe("導出値を持つ seed の reconcile", () => {
  test("料金プランは既存行も宣言値へ寄せ直す", () => {
    const body = functionBody("seedSpaceRatePlans");

    // 書き戻しが無ければ導出元の変更に追随できない。
    expect(body).toContain("prisma.spaceRatePlan.updateMany(");

    // 「無ければ作るだけ」への逆戻り検出。
    expect(body).not.toContain("Skipped existing rate plan");
  });

  test("料金プランの存在確認が非決定的な findFirst でない", () => {
    const body = functionBody("seedSpaceRatePlans");

    // `SpaceRatePlan` に (spaceId, name) の unique は無い。`orderBy` 無しの
    // `findFirst` は同名が複数あるとき Postgres の返却順に依存する。
    expect(body).not.toContain("prisma.spaceRatePlan.findFirst(");
  });

  test("導出鎖が smoke spec の期待額と一致している", () => {
    const source = readFileSync(SEED, "utf8");
    const body = functionBody("seedSpaceRatePlans");
    const spec = readFileSync(
      join(process.cwd(), "e2e/smoke/rate-plan-preview.smoke.spec.ts"),
      "utf8",
    );

    // 係数が動いたら spec の実額も動く。両方を同時に更新させるための結合。
    expect(body).toContain("space.hourlyPrice * 1.3");

    // `coworking-space` の宣言基本料金を seed から読む（ハードコードしない）。
    const declared =
      /slug: "coworking-space",[\s\S]*?hourlyPrice: (\d+),/u.exec(source);
    if (!declared?.[1]) {
      throw new Error("coworking-space の hourlyPrice 宣言が見つかりません");
    }

    // spec が選ぶのは金曜 19:00-21:00 の **2 時間**。標準税率 10% の税込表示。
    const weekendHourly = Math.round(Number(declared[1]) * 1.3);
    const withTax = Math.round(weekendHourly * 2 * 1.1);
    expect(spec).toContain(`¥${withTax.toLocaleString("en-US")}（税込）`);
  });
});
