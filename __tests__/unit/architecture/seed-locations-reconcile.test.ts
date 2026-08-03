import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * `seedLocations` が **本番では既存行に触らない**ことの gate。
 *
 * ## 何が起きていたか
 *
 * `seedProduction` は `seedLocations(false)` を呼ぶ。`overridePublished` が効くのは
 * `isPublished` だけで、update に渡す payload は宣言全体だった。つまり
 * `--production` を再実行するたびに、管理画面で実在の拠点情報へ直した行へ
 * 「東京都渋谷区神宮前1-1-1 サンプルビル」「03-1234-5678」「¥1,000〜¥5,000/時間」
 * といった**架空のテンプレート値が書き戻され、公開中の拠点が非公開に落ちて**いた。
 *
 * `--production` の再実行は運用中に普通に起こる（初期スタッフの追加など）。
 * seed は「無いものを作る」だけであるべきで、あるものを宣言へ引き戻してよいのは
 * 開発用 DB に限られる。
 *
 * ## なぜ dev では収束させるか
 *
 * `scripts/migrate-test-db.ts` は `migrate deploy` しか流さないので、宣言を変えても
 * 既存の dev / test DB には反映されない。収束させないとローカルだけが CI と静かに
 * 食い違う（`seed-space-reconcile.test.ts` の docblock に実害の例がある）。
 *
 * `seedSpaces` / `seedNavigation` は既にこの分離を持っていた。`seedLocations` だけが
 * 外れており、しかも `seedNavigation` の docblock は
 * 「`seedLocations(false)` / `seedFaq(false)` と同じ dev/prod 分離の形」と
 * **誤って**書いていた。
 */

const SEED = join(process.cwd(), "prisma/seed.ts");

function seedLocationsBody(): string {
  const source = readFileSync(SEED, "utf8");
  const body = /async function seedLocations\([^)]*\)[\s\S]*?\n\}/u.exec(
    source,
  );
  if (!body) throw new Error("seedLocations が見つかりません");
  return body[0];
}

describe("seedLocations の収束", () => {
  test("gate が空振りしていない", () => {
    expect(seedLocationsBody().length).toBeGreaterThan(500);
  });

  test("収束は dev 限定（本番は既存行に触らない）", () => {
    const body = seedLocationsBody();
    expect(body).toContain(
      "const reconcileDeclaredContent = overridePublished === undefined",
    );
    // 既存行の update へ到達する前に本番を弾いていること
    expect(body).toContain("if (!reconcileDeclaredContent)");
    expect(readFileSync(SEED, "utf8")).toContain("await seedLocations(false)");
  });

  test("dev では既存行を宣言内容へ収束させる（skip したままにしない）", () => {
    expect(seedLocationsBody()).toContain("prisma.location.update(");
  });
});
