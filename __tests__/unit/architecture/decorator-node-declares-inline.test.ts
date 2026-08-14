import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * `DecoratorNode` の派生は `isInline()` を**必ず自分で宣言する**ことの gate。
 *
 * ## なぜ
 *
 * Lexical の `DecoratorNode` 既定は `isInline(): true`。block な DOM
 * （`<div>` / `<figure>` 等）を `exportDOM` で出すノードが inline のままだと、
 * `$insertNodes` が **ParagraphNode の子**として splice する。すると exportDOM は
 * `<p>前半<div>…</div>後半</p>` を出す。
 *
 * 保存パイプラインの enrich が DOMParser で再パースして `doc.body.innerHTML` を
 * 返すため、HTML 仕様どおり `<div>` の直前で `<p>` が閉じられ、DB に入る
 * `contentHtml` が `<p>前半</p><div>…</div>後半<p></p>` に化ける。公開ページでは
 * **画像より後ろの本文が `<p>` の外に出て段落スタイルを失い、末尾に空段落が残る**。
 *
 * 編集画面は Lexical が DOM を programmatic に組むので再パースが起きず、
 * **管理者には正常に見える**。気づけるのは公開面だけ。
 *
 * 実測（監査 F-26）: 19 個の DecoratorNode のうち **14 個**が override 無しだった。
 * 1 件の見落としではなく、既定値が罠になっている形なので gate にする。
 *
 * ## 何を見るか
 *
 * 「block DOM を出しているか」を静的に判定しようとしない（`exportDOM` の中身は
 * ヘルパー越しにも書けるので、正規表現で追うと必ず漏れる）。代わりに
 * **どちらであれ明示すること**だけを要求する。既定値に頼らせないのが目的で、
 * inline なら inline と書けば通る。
 *
 * ## 直し方
 *
 * そのノードが block なら:
 *
 * ```ts
 * override isInline(): false {
 *   return false;
 * }
 * ```
 *
 * inline なら `true` を返す（`InlineImageNode` / `RubyNode` が見本）。
 */

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

/** `extends DecoratorNode<...>` を持つファイルだけを対象にする。 */
const DECORATOR_NODE = /class\s+\w+\s+extends\s+DecoratorNode\b/u;

/**
 * `isInline()` の**宣言**。`override` を必須にして、呼び出しや散文と区別する。
 *
 * 実測: `\bisInline\s*\(\s*\)` だけだと、この gate 自身が書かせた JSDoc の
 * 「`override isInline(): false` を足す」という**説明文**にマッチして、
 * メソッドを消しても緑のままだった（変異検査で検出）。コメント除去と
 * `override` 必須の両方を掛ける。
 */
const DECLARES_IS_INLINE = /\boverride\s+isInline\s*\(\s*\)/u;

/** 判定前にコメントを落とす。散文の中の語をコードと取り違えないため。 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//gu, "")
    .replace(/(^|\s)\/\/.*$/gmu, "");
}

function listNodeSources(): { file: string; source: string }[] {
  return [...new Bun.Glob("*.{ts,tsx}").scanSync({ cwd: NODES_DIR })]
    .sort()
    .map((file) => ({
      file,
      source: stripComments(readFileSync(join(NODES_DIR, file), "utf8")),
    }));
}

describe("DecoratorNode は isInline を明示する", () => {
  const sources = listNodeSources();
  const decorators = sources.filter((entry) =>
    DECORATOR_NODE.test(entry.source),
  );

  test("gate が空振りしていない", () => {
    // 走査規模の下限。ディレクトリの移動・改名で 0 件になっても
    // `toEqual([])` は緑になる。
    expect(sources.length).toBeGreaterThan(30);
    expect(decorators.length).toBeGreaterThan(15);

    // 判定の見本（落ちてはいけない形 / 落ちるべき形）。
    // 実装を変異させても落ちない fixture は fixture ではない。
    const blockLike = `class Foo extends DecoratorNode<null> {
      override isInline(): false { return false; }
    }`;
    const missing = `class Foo extends DecoratorNode<null> {
      override decorate() { return null; }
    }`;
    // 散文だけでは通らない（この gate の初版が実際に踏んだ形）。
    const proseOnly = stripComments(`class Foo extends DecoratorNode<null> {
      /** override isInline(): false を足すこと。 */
      override decorate() { return null; }
    }`);
    expect(
      DECORATOR_NODE.test(blockLike) && DECLARES_IS_INLINE.test(blockLike),
    ).toBe(true);
    expect(
      DECORATOR_NODE.test(missing) && DECLARES_IS_INLINE.test(missing),
    ).toBe(false);
    expect(
      DECORATOR_NODE.test(proseOnly) && DECLARES_IS_INLINE.test(proseOnly),
    ).toBe(false);
  });

  test("全 DecoratorNode が isInline を宣言している", () => {
    const offenders = decorators
      .filter((entry) => !DECLARES_IS_INLINE.test(entry.source))
      .map(
        (entry) =>
          `${entry.file}: DecoratorNode の既定は isInline()===true。block DOM を出すなら override isInline(): false を足す（inline なら true を明示する）`,
      );

    expect(offenders).toEqual([]);
  });
});
