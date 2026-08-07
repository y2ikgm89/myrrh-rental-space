/**
 * ソースに実制御文字を書かない。
 *
 * ## なぜ
 *
 * NUL を含むファイルを Git は**バイナリとして扱う**。差分が
 * `Bin 6536 -> 6976 bytes` / `0 insertions(+), 0 deletions(-)` になり、
 * **レビューにも `git log -p` にも検索にも中身が出てこない**。
 *
 * 実際に起きた: 正規表現の端点を `[\u0000-\u001F]` と書いたつもりで実文字を
 * 埋め込んでしまい、そのまま merge された（#1859）。私はそのとき「制御文字 0 を
 * 確認済み」と PR に書いていたが、走査したのはテストファイルだけで、
 * 変更した本体は見ていなかった。差分がバイナリ扱いなのでレビューでも気づけない。
 *
 * ## 見分けがつかないという性質
 *
 * `\u0001` というエスケープ表記と実際の U+0001 は、端末でもレビュー画面でも
 * 差分でも同じに見える（何も見えない）。**目視では判定できない**ので機械で見る。
 * 書くときは `String.fromCharCode(0x01)` かエスケープ表記を使う。
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { trackedTextFiles } from "../../support/tracked-files";

const ROOT = process.cwd();

/**
 * 走査対象とバイナリ拡張子の一覧は `__tests__/support/tracked-files.ts` が SSoT。
 * 同じ一覧を 2 箇所に書くと片方だけ更新されるので、共有ヘルパーへ寄せてある。
 */
function trackedFiles(): string[] {
  return trackedTextFiles(ROOT);
}

/** tab / LF / CR は通常のテキストなので除く。それ以外の C0 と DEL を見る。 */
function findControlCharacters(source: string): readonly number[] {
  const found: number[] = [];
  for (let i = 0; i < source.length; i += 1) {
    const code = source.charCodeAt(i);
    const isAllowed = code === 0x09 || code === 0x0a || code === 0x0d;
    if ((code < 0x20 && !isAllowed) || code === 0x7f) found.push(code);
  }
  return found;
}

describe("source files stay text", () => {
  test("実制御文字を含むファイルが無い", () => {
    const violations: string[] = [];

    const files = trackedFiles();
    // gate が空振りしていないこと（git 呼び出しが壊れると 0 件で緑になる）。
    expect(files.length).toBeGreaterThan(1000);

    for (const name of files) {
      const codes = findControlCharacters(
        readFileSync(join(ROOT, name), "utf8"),
      );
      if (codes.length === 0) continue;

      const shown = [...new Set(codes)]
        .map((c) => `U+${c.toString(16).toUpperCase().padStart(4, "0")}`)
        .join(", ");
      violations.push(`${name} (${codes.length} 個: ${shown})`);
    }

    expect(violations).toEqual([]);
  });
});
