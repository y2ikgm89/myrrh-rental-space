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
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";

const ROOT = process.cwd();

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

/**
 * **走査対象は git に聞く。ディレクトリを列挙しない。**
 *
 * 拡張子の許可リストを反転させた（#1864）のに、ディレクトリ側は列挙のままだった。
 * 同じ欠陥が 1 階層上に残っていたことになる。実測: tracked 3,687 件のうち
 * `SCAN_DIRS` が覆っていたのは 3,455 件で、`eslint-rules/` 6 件・`.github/` 21 件・
 * `terraform/` 24 件・`docs/` 65 件などが素通りしていた。lint ルール本体
 * （正規表現を書く場所＝この gate が生まれた原因と同じ種類のコード）が
 * 対象外だったのが端的に悪い。
 *
 * tracked file は「コミットされる ＝ レビューされるべきもの」と過不足なく一致し、
 * ビルド成果物と依存は .gitignore で構造的に外れる。新しいディレクトリを足しても
 * 何もしなくて済む。
 */
function trackedFiles(): string[] {
  const stdout = execFileSync("git", ["ls-files", "-z"], {
    cwd: ROOT,
    maxBuffer: 32 * 1024 * 1024,
  }).toString("utf8");

  return (
    stdout
      // NUL は**実文字を書かない**（この gate 自身の指針）。
      .split(String.fromCharCode(0))
      .filter((entry) => entry.length > 0)
      .filter((entry) => !BINARY_EXTENSIONS.has(extname(entry).toLowerCase()))
  );
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
