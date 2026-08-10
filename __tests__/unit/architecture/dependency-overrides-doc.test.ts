/**
 * **`docs/dependency-overrides.md` の表は `package.json` の `overrides` と 1 対 1 で一致する。**
 *
 * ## なぜ
 *
 * この doc は自分で「追加時は rationale をこの表に 1 行追記する」と定めているのに、
 * 実測（2026-08-09）では守られていなかった:
 *
 * - `undici` / `sharp` / `valibot` の 3 件が**表に載らないまま**追加されていた
 * - `protobufjs` / `fast-uri` / `postcss` / `hono` / `@hono/node-server` /
 *   `brace-expansion` の 6 件が版ずれのまま残っていた（doc の `protobufjs ^8.6.5` は
 *   advisory 対象 `<=8.6.5` そのもので、**脆弱版を許す値**が手順書に載っていた）
 *
 * pin 表は「どれを上げれば `bun audit` が緑に戻るか」を読む場所なので、
 * 抜けと版ずれは調査を一周分ムダにする。人の規律ではなく機械で一致させる。
 *
 * ## 何を見るか
 *
 * doc の表の Package 列・Pin 列と `package.json` の `overrides` が完全一致すること。
 * **rationale（経路）の正しさは見ない** — `bun why` の実測を静的には再現できない。
 * ここが保証するのは「表に全件が、正しい版で載っていること」だけ。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

/** doc の `| Package | Pin | 経路 |` 表を読む。ヘッダ行を起点にし、表が終わったら止める。 */
export function readOverrideTable(markdown: string): Map<string, string> {
  const rows = new Map<string, string>();
  const lines = markdown.split("\n");
  const headerIndex = lines.findIndex((line) => {
    return /^\|\s*Package\s*\|\s*Pin\s*\|/u.test(line);
  });
  if (headerIndex < 0) return rows;

  // ヘッダの次は区切り行 (`| --- | --- |`)。その次から表本体。
  for (const line of lines.slice(headerIndex + 2)) {
    if (!line.startsWith("|")) break;
    const cells = line.split("|").map((cell) => cell.trim());
    const name = cells[1]?.replaceAll("`", "");
    const pin = cells[2]?.replaceAll("`", "");
    if (name && pin) rows.set(name, pin);
  }
  return rows;
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

  test("parser は表以外を拾わず、抜け・版ずれを見分けられる（見本）", () => {
    expect([
      ...readOverrideTable(`# 前書き

| 別の表 | 列 |
| ------ | -- |
| これは  | 拾わない |

| Package | Pin     | 経路 |
| ------- | ------- | ---- |
| \`pg\`    | ^8.22.0 | a    |
| \`ws\`    | ^8.21.0 | b    |

後続の散文は表ではないので止まる。
`),
    ]).toEqual([
      ["pg", "^8.22.0"],
      ["ws", "^8.21.0"],
    ]);
  });

  test("Package と Pin が package.json の overrides と完全一致する", () => {
    const table = readOverrideTable(
      readFileSync(join(ROOT, "docs", "dependency-overrides.md"), "utf8"),
    );
    // 抜け・余剰・版ずれをまとめて 1 つの差分として出す。
    expect(Object.fromEntries(table)).toEqual(readOverrides());
  });
});
