/**
 * **`docs/dependency-overrides.md` の表は `package.json` の `overrides` と過不足なく一致する。**
 *
 * ## なぜ
 *
 * この doc は自分で「追加時は rationale をこの表に 1 行追記する」と定めているのに、
 * 実測（2026-08-09）では守られておらず、`undici` / `sharp` / `valibot` の 3 件が
 * **表に載らないまま**追加されていた。表は「その pin を外してよいか」を読む場所なので、
 * 抜けは調査を一周分ムダにする。人の規律ではなく機械で一致させる。
 *
 * ## 版は見ない
 *
 * 以前は Pin 列も突き合わせていたが、**SSoT の値を書き写す形は必ずドリフトする**ため
 * doc 側から Pin 列ごと廃止した。実測（2026-08-11）: Renovate が `overrides` の版を
 * 上げる PR を出すと `package.json` だけが動き、doc が取り残されて**この gate が落ちる**。
 * 該当は初回スキャンだけで 10 件あり、以後も版が動くたびに再発する形だった。
 *
 * 版の正本は `package.json` の `overrides` ひとつだけにして、doc には
 * そこから導けないもの（`bun why` 実測の「経路」）だけを残す。
 *
 * ## 何を見るか
 *
 * doc の表の Package 列と `package.json` の `overrides` のキー集合が完全一致すること。
 * **経路の正しさは見ない** — `bun why` の実測を静的には再現できない。ここが保証するのは
 * 「表に全件が、経路つきで載っていること」だけ。経路セルが空の行は行として数えないので、
 * 理由を書かずに名前だけ足しても抜けとして落ちる。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

/**
 * doc の `| Package | 経路 |` 表から Package 名を読む。ヘッダ行を起点にし、表が終わったら止める。
 * **経路セルが空の行は採用しない**（理由の無い行を「載っている」と数えないため）。
 */
export function readOverrideTable(markdown: string): Set<string> {
  const names = new Set<string>();
  const lines = markdown.split("\n");
  const headerIndex = lines.findIndex((line) => {
    return /^\|\s*Package\s*\|/u.test(line);
  });
  if (headerIndex < 0) return names;

  // ヘッダの次は区切り行 (`| --- | --- |`)。その次から表本体。
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith("|")) break;
    const cells = line.split("|").map((cell) => cell.trim());
    const name = cells[1]?.replaceAll("`", "");
    const route = cells[2];
    if (name && route) names.add(name);
  }
  return names;
}

function readOverrides(): Record<string, string> {
  const raw: unknown = JSON.parse(
    readFileSync(join(ROOT, "package.json"), "utf8"),
  );
  const overrides =
    typeof raw === "object" && raw !== null && "overrides" in raw
      ? raw.overrides
      : undefined;
  if (typeof overrides !== "object" || overrides === null) return {};
  return Object.fromEntries(
    Object.entries(overrides).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

describe("dependency overrides の doc は package.json と一致する", () => {
  test("表が読めている（gate が空振りしていない）", () => {
    const table = readOverrideTable(
      readFileSync(join(ROOT, "docs", "dependency-overrides.md"), "utf8"),
    );
    expect(table.size).toBeGreaterThan(10);
  });

  test("parser は表以外を拾わず、経路の無い行も数えない（見本）", () => {
    expect([
      ...readOverrideTable(`# 前書き

| 別の表 | 列 |
| ------ | -- |
| これは  | 拾わない |

| Package | 経路 |
| ------- | ---- |
| \`pg\`    | a    |
| \`ws\`    | b    |
| \`tmp\`   |      |

後続の散文は表ではないので止まる。
`),
    ]).toEqual(["pg", "ws"]);
  });

  test("Package が package.json の overrides と完全一致する", () => {
    const table = readOverrideTable(
      readFileSync(join(ROOT, "docs", "dependency-overrides.md"), "utf8"),
    );
    // 抜け・余剰をまとめて 1 つの差分として出す。
    expect([...table].sort()).toEqual(Object.keys(readOverrides()).sort());
  });
});
