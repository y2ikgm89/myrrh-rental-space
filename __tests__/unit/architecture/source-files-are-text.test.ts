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
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOT = process.cwd();

/** 走査するディレクトリ。ビルド成果物と依存は見ない。 */
const SCAN_DIRS = ["src", "__tests__", "scripts", "e2e", "prisma"];

/**
 * **バイナリだけを挙げ、それ以外は全部見る。** 逆（テキスト拡張子の許可リスト）に
 * すると新しい種類が黙って対象外になる — 最初の版が実際にそうで、`.sh` 5 件・
 * `.prisma` 2 件・`.toml` 1 件が走査されていなかった（Codex の指摘）。
 *
 * 挙げ漏れたバイナリは「テキストとして読めない」で落ちる = 気づける。
 * 挙げ漏れたテキストは黙って素通りする = 気づけない。落ちる側に倒す。
 */
const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".mp4",
  ".webm",
  ".mp3",
  ".wav",
]);

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

function collectFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "generated")
      continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) {
      out.push(...collectFiles(p));
    } else if (!BINARY_EXTENSIONS.has(extname(entry).toLowerCase())) {
      out.push(p);
    }
  }
  return out;
}

describe("source files stay text", () => {
  test("実制御文字を含むファイルが無い", () => {
    const violations: string[] = [];

    for (const dir of SCAN_DIRS) {
      const abs = join(ROOT, dir);
      let files: string[];
      try {
        files = collectFiles(abs);
      } catch {
        continue; // 存在しないディレクトリは飛ばす
      }

      for (const filePath of files) {
        const codes = findControlCharacters(readFileSync(filePath, "utf8"));
        if (codes.length === 0) continue;

        const name = relative(ROOT, filePath).split("\\").join("/");
        const shown = [...new Set(codes)]
          .map((c) => `U+${c.toString(16).toUpperCase().padStart(4, "0")}`)
          .join(", ");
        violations.push(`${name} (${codes.length} 個: ${shown})`);
      }
    }

    expect(violations).toEqual([]);
  });
});
