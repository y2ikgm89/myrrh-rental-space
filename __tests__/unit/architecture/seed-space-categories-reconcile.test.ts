import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * `seedSpaceCategories` が **本番では既存行に触らない**ことの gate。
 *
 * ## 何が起きていたか
 *
 * `seedProduction` は `seedSpaceCategories()` を引数なしで呼んでいた。
 * 既存行は name 一致で見つかり、description / icon / color が宣言値へ
 * 書き戻されていた。sortOrder だけ温存されるので、並びは変わらず内容だけが
 * seed 値に戻り、変更に気付きにくい。
 *
 * `--production` の再実行は運用中に普通に起こる（初期スタッフの追加など）。
 * seed は「無いものを作る」だけであるべきで、あるものを宣言へ引き戻してよいのは
 * 開発用 DB に限られる。
 *
 * ## なぜ dev では収束させるか
 *
 * `scripts/migrate-test-db.ts` は `migrate deploy` しか流さないので、宣言を変えても
 * 既存の dev / test DB には反映されない。収束させないとローカルだけが CI と静かに
 * 食い違う（`seed-locations-reconcile.test.ts` の docblock と同じ契約）。
 */

const SEED = join(process.cwd(), "prisma/seed.ts");

function seedSpaceCategoriesBody(): string {
  const source = readFileSync(SEED, "utf8");
  const body = /async function seedSpaceCategories\([^)]*\)[\s\S]*?\n\}/u.exec(
    source,
  );
  if (!body) throw new Error("seedSpaceCategories が見つかりません");
  return body[0];
}

describe("seedSpaceCategories の収束", () => {
  test("gate が空振りしていない", () => {
    expect(seedSpaceCategoriesBody().length).toBeGreaterThan(500);
  });

  test("収束は dev 限定（本番は既存行に触らない）", () => {
    const body = seedSpaceCategoriesBody();
    expect(body).toMatch(/async function seedSpaceCategories\(\s*reconcile/u);
    expect(body).toContain("if (!reconcile)");
    expect(readFileSync(SEED, "utf8")).toContain(
      "await seedSpaceCategories(false)",
    );
  });

  test("dev では既存行を宣言内容へ収束させる（skip したままにしない）", () => {
    expect(seedSpaceCategoriesBody()).toContain("prisma.spaceCategory.update(");
  });
});
