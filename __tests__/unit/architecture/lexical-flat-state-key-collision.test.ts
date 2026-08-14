import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * `flat: true` の NodeState キーが、Lexical の予約キーと衝突しないことの gate。
 *
 * ## なぜ
 *
 * `flat: true` の state は **JSON の直下**に書かれる。`SerializedElementNode` /
 * `SerializedTextNode` / `SerializedLexicalNode` が予約している名前を使うと、
 * 同じ場所を 2 人が書くことになる。
 *
 * 実測（監査 F-27）: `TimelineContainerNode` の state キーが `"direction"` だった。
 * `ElementNode.exportJSON()` は `direction: this.getDirection()` を先に置いて
 * 最後に `...super.exportJSON()` を spread するので、`horizontal` のとき state が
 * ElementNode の `direction` を上書きし、import 時の
 * `.setDirection(serializedNode.direction)` が `__dir="horizontal"` を作る。
 *
 * `vertical` に戻すと state は default 扱いで JSON から消えるが、残った
 * `__dir="horizontal"` が `direction` として書き出され、次の import で state として
 * 読み戻される。**縦に戻す手段がノードの削除しか無くなる**。エラーは出ない。
 *
 * ## 何を見るか
 *
 * 予約キーは**写経しない**。`node_modules/lexical` の `.d.ts` から読む。
 * 写すと、Lexical 側が予約キーを増やしたときに素通りする。
 *
 * ## 直し方
 *
 * state キーをノード固有の名前へ変える（`direction` → `timelineDirection`）。
 * どうしてもその名前が要るなら `flat: true` をやめて `$` 配下に置く。
 */

const LEXICAL_DIST = join(process.cwd(), "node_modules", "lexical", "dist");

const NODES_DIR = join(
  process.cwd(),
  "src",
  "app",
  "(admin)",
  "admin",
  "(dashboard)",
  "_shared",
  "components",
  "editor",
  "lexical",
  "nodes",
);

/**
 * `.d.ts` の `export type X = Spread<{ ... }, ...>` / `= { ... }` から
 * トップレベルのプロパティ名を拾う。
 */
function readSerializedKeys(file: string, typeName: string): string[] {
  const source = readFileSync(join(LEXICAL_DIST, file), "utf8");
  const start = source.indexOf(`export type ${typeName}`);
  if (start === -1) return [];
  const open = source.indexOf("{", start);
  const close = source.indexOf("}", open);
  if (open === -1 || close === -1) return [];
  return [...source.slice(open + 1, close).matchAll(/^\s*(\w+)\??\s*:/gmu)].map(
    (match) => match[1] ?? "",
  );
}

/**
 * 予約キーは**基底クラスごとに違う**。`style` は `SerializedTextNode` だけの
 * 予約で、`ElementNode` 派生では衝突しない（実測: GalleryNode 等 3 件が
 * `createState("style")` を flat 登録しているが、これは正しい）。
 * 一律に足すと健全な実装を violation にしてしまう。
 */
function reservedKeysByBase(): Record<NodeBase, Set<string>> {
  const base = readSerializedKeys("LexicalNode.d.ts", "SerializedLexicalNode");
  const element = readSerializedKeys(
    "nodes/LexicalElementNode.d.ts",
    "SerializedElementNode",
  );
  const text = readSerializedKeys(
    "nodes/LexicalTextNode.d.ts",
    "SerializedTextNode",
  );
  return {
    ElementNode: new Set([...base, ...element]),
    TextNode: new Set([...base, ...text]),
    DecoratorNode: new Set(base),
  };
}

type NodeBase = "ElementNode" | "TextNode" | "DecoratorNode";

type FlatStateUsage = {
  file: string;
  stateName: string;
  key: string;
  base: NodeBase;
};

/** `createState("<key>", …)` の宣言。 */
const CREATE_STATE = /export const (\w+) = createState\(\s*"([^"]+)"/gu;

/** `{ flat: true, stateConfig: <name> }` の登録。 */
const FLAT_REGISTRATION = /flat:\s*true,\s*stateConfig:\s*(\w+)/gu;

/** `class X extends (ElementNode|TextNode|DecoratorNode)` の宣言位置。 */
const CLASS_DECLARATION =
  /class\s+\w+\s+extends\s+(ElementNode|TextNode|DecoratorNode)\b/gu;

/**
 * flat 登録の直前にある class 宣言の基底を取る。
 *
 * **粗い判定**である旨を明記しておく: 1 ファイルに複数クラスがあるとき、
 * 位置で最も近い宣言に帰属させているだけで、AST は見ていない。`$config()` は
 * どのノードでもクラス本体の先頭付近にあるので実用上は足りる。外れると
 * 予約キーの集合が変わるだけで、`ElementNode` の集合が最大なので**緩む方向には
 * 倒れない**（DecoratorNode を ElementNode と誤認すれば厳しく出る）。
 */
function resolveBaseAt(source: string, index: number): NodeBase {
  let base: NodeBase = "ElementNode";
  for (const match of source.matchAll(CLASS_DECLARATION)) {
    if (match.index === undefined || match.index > index) break;
    const found = match[1];
    if (
      found === "ElementNode" ||
      found === "TextNode" ||
      found === "DecoratorNode"
    ) {
      base = found;
    }
  }
  return base;
}

function collectFlatStateUsages(): {
  usages: FlatStateUsage[];
  scanned: number;
} {
  const files = [
    ...new Bun.Glob("*.{ts,tsx}").scanSync({ cwd: NODES_DIR }),
  ].sort();
  const usages: FlatStateUsage[] = [];

  for (const file of files) {
    const source = readFileSync(join(NODES_DIR, file), "utf8");
    const keyByStateName = new Map<string, string>();
    for (const match of source.matchAll(CREATE_STATE)) {
      const [, stateName, key] = match;
      if (stateName && key) keyByStateName.set(stateName, key);
    }
    for (const match of source.matchAll(FLAT_REGISTRATION)) {
      const stateName = match[1];
      if (!stateName || match.index === undefined) continue;
      const key = keyByStateName.get(stateName);
      // 別ファイルから import している state はこのファイルでは解決できない。
      if (key === undefined) continue;
      usages.push({
        file,
        stateName,
        key,
        base: resolveBaseAt(source, match.index),
      });
    }
  }

  return { usages, scanned: files.length };
}

describe("flat state キーは Lexical の予約キーと衝突しない", () => {
  const reserved = reservedKeysByBase();
  const { usages, scanned } = collectFlatStateUsages();

  test("gate が空振りしていない", () => {
    // 予約キーを実際に読めていること（写経していないことの証明）。
    expect(reserved.ElementNode.size).toBeGreaterThan(6);
    for (const key of ["type", "version", "children", "direction", "format"]) {
      expect(reserved.ElementNode.has(key)).toBe(true);
    }

    // 走査規模の下限。
    expect(scanned).toBeGreaterThan(30);
    expect(usages.length).toBeGreaterThan(50);

    // 判定の見本: 元の欠陥そのものの形が違反と判定されること。
    expect(reserved.ElementNode.has("direction")).toBe(true);
    // 落ちてはいけない形（改名後の名前と、TextNode 限定の予約キー）。
    expect(reserved.ElementNode.has("timelineDirection")).toBe(false);
    expect(reserved.TextNode.has("style")).toBe(true);
    expect(reserved.ElementNode.has("style")).toBe(false);
  });

  test("衝突している flat state キーが無い", () => {
    const offenders = usages
      .filter((usage) => reserved[usage.base].has(usage.key))
      .map(
        (usage) =>
          `${usage.file}: createState("${usage.key}") が ${usage.base} 派生で flat 登録されている。"${usage.key}" は Serialized${usage.base === "DecoratorNode" ? "Lexical" : usage.base.replace("Node", "")}Node の予約キーなので、ノード固有の名前へ変えること`,
      );

    expect(offenders).toEqual([]);
  });
});
