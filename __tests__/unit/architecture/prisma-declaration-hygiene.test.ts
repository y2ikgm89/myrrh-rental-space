/**
 * Prisma の宣言が「実際の挙動」とずれていないことの gate。
 *
 * 対象は 2 つとも**振る舞いを変えない**宣言だが、放っておくと読み手が誤解する形で
 * 溜まる種類のもの。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

function read(relativePath: string): string {
  return readFileSync(join(ROOT, relativePath), "utf8");
}

describe("Prisma の宣言", () => {
  test("`@db.JsonB` を書かない（PostgreSQL では既定なので常に冗長）", () => {
    // 実測: 注釈ありの schema と全削除した schema で
    // `prisma migrate diff --from-schema … --to-schema … --script` が
    // "This is an empty migration." を返す。つまり DDL は 1 文字も変わらない。
    //
    // 32 本ある Json 列のうち 2 本にだけ付いていたので、「この 2 本は何か特別なのか」と
    // 読ませてしまっていた。特別ではない。付けないことで揃える。
    const schema = read("prisma/schema.prisma");
    const offenders = schema
      .split(/\r?\n/u)
      .map((line, index) => ({ line: line.trim(), number: index + 1 }))
      .filter(({ line }) => /@db\.jsonb\b/iu.test(line))
      .map(({ line, number }) => `L${String(number)}: ${line}`);

    expect(offenders).toEqual([]);
  });

  test("prisma.config.ts が migrations.path を明示する", () => {
    // 既定でも `prisma/migrations` になるが、その既定は **schema の置き場から**
    // 導出される。schema を動かした瞬間に migration の探索先まで黙って動くので、
    // 動いてはいけない側を宣言で固定しておく。
    const config = read("prisma.config.ts");

    expect(config).toMatch(/migrations:\s*\{/u);
    expect(config).toMatch(/path:\s*"prisma\/migrations"/u);
  });
});
