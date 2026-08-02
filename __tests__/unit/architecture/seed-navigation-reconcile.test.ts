import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * dev の reconcile が、**宣言している列を全部戻す**ことを機械強制する gate。
 *
 * ## 何が半端だったか
 *
 * `seedNavigation` の `update` は `label` と `url` だけを戻していた。
 * `isExternal` / `isActive` / `parentId` は schema の `@default` に任せていて
 * `create` でしか効かないので、管理画面でそれらを変えた行は
 * **url だけが宣言値に戻り、他は変えられたまま**になる:
 *
 * - `isExternal: true` のまま `url: "/"` にされ、内部リンクが外部リンク扱いになる
 * - 既定の項目が `isActive: false` のまま出てこない
 * - `parentId` が付いたまま別項目の下にぶら下がる
 *
 * 「dev では宣言内容へ収束する」と謳っている以上、宣言している列は全部戻す。
 *
 * ## 本番との切り分け
 *
 * `seedProduction` は `seedNavigation(false)` を呼び、`update` は空のまま。
 * 本番の再実行が管理画面の編集を踏み潰さないための境界なので、こちらも守る。
 */

const SEED = join(process.cwd(), "prisma/seed.ts");
const SCHEMA = join(process.cwd(), "prisma/schema.prisma");

function seedNavigationBody(): string {
  const source = readFileSync(SEED, "utf8");
  const match = /async function seedNavigation\([^)]*\)[\s\S]*?\n\}/u.exec(
    source,
  );
  if (!match) {
    throw new Error("seedNavigation が見つかりません");
  }
  return match[0];
}

/** `NavigationItem` のうち seed が宣言しうる列（id / 監査列 / relation を除く）。 */
function declarableColumns(): string[] {
  const model = /^model NavigationItem\s*\{([\s\S]*?)^\}/mu.exec(
    readFileSync(SCHEMA, "utf8"),
  );
  if (!model?.[1]) throw new Error("NavigationItem が見つかりません");

  const skip = new Set(["id", "createdAt", "updatedAt", "type", "order"]);
  return [...model[1].matchAll(/^\s{2}(\w+)\s+\S+/gmu)]
    .map((m) => String(m[1]))
    .filter((name) => !skip.has(name))
    .filter((name) => !/^(parent|children)$/u.test(name));
}

describe("ナビゲーションの reconcile", () => {
  test("宣言内容を create と update で共有している", () => {
    const body = seedNavigationBody();

    // 片方だけ直す事故を構造的に潰す。
    expect(body).toContain("const declaredContent = {");
    expect(body).toContain("update: reconcile ? declaredContent : {}");
    expect(body).toContain("...declaredContent,");
  });

  test("宣言できる列を取りこぼしていない", () => {
    const body = seedNavigationBody();
    const declared = /const declaredContent = \{([\s\S]*?)\n {6}\};/u.exec(
      body,
    );
    if (!declared?.[1]) {
      throw new Error("declaredContent の宣言が見つかりません");
    }

    const columns = declarableColumns();
    // gate が空振りしていないこと（schema の読み取りが腐ると空配列になる）。
    expect(columns.length).toBeGreaterThan(0);

    const missing = columns.filter(
      (column) => !new RegExp(`\\b${column}\\b`, "u").test(String(declared[1])),
    );

    expect(missing).toEqual([]);
  });

  test("本番の再実行は既存行を書き換えない", () => {
    const source = readFileSync(SEED, "utf8");
    const body = seedNavigationBody();

    // reconcile が false のときは update が空であること。
    expect(body).toContain("update: reconcile ? declaredContent : {}");

    const prod = /async function seedProduction\([^)]*\)[\s\S]*?\n\}/u.exec(
      source,
    );
    if (!prod) throw new Error("seedProduction が見つかりません");
    expect(prod[0]).toContain("seedNavigation(false)");
  });
});
