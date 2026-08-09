import { execFileSync } from "node:child_process";
import { extname } from "node:path";

/**
 * **走査対象は git に聞く。ディレクトリを列挙しない。**
 *
 * 手書きのディレクトリ一覧は必ず漏れる。実測 2 回:
 *
 * - `source-files-are-text` は `SCAN_DIRS` 方式のとき tracked 3,687 件のうち
 *   3,455 件しか覆えず、`eslint-rules/` `.github/` `terraform/` `docs/` が素通りしていた
 * - `referenced-gates-exist` は `src` / `scripts` / `prisma` などを列挙したため、
 *   `Dockerfile` / `eslint.config.mjs` / `lefthook.yml` / `.github/CODEOWNERS`
 *   に実在するポインタを 1 件も見ていなかった（Codex 指摘）
 *
 * tracked file は「コミットされる ＝ レビューされるべきもの」と過不足なく一致し、
 * ビルド成果物と依存は .gitignore で構造的に外れる。新しいディレクトリや設定ファイルを
 * 足しても、この関数の利用者は何もしなくて済む。
 *
 * `git ls-files` は index を読むだけなので、CI の shallow checkout でも動く
 * （`origin/main` の ref を要求する形にしないこと）。
 */

/**
 * **バイナリだけを挙げ、それ以外は全部見る。** 逆（テキスト拡張子の許可リスト）に
 * すると新しい種類が黙って対象外になる。
 *
 * 挙げ漏れたバイナリは「テキストとして読めない」で落ちる = 気づける。
 * 挙げ漏れたテキストは黙って素通りする = 気づけない。落ちる側に倒す。
 */
export const BINARY_EXTENSIONS: ReadonlySet<string> = new Set([
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

/** git が追跡しているテキストファイル（repo 相対・POSIX 区切り）。 */
export function trackedTextFiles(root: string): string[] {
  const stdout = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    maxBuffer: 32 * 1024 * 1024,
  }).toString("utf8");

  return (
    stdout
      // NUL は**実文字を書かない**（source-files-are-text の指針）。
      .split(String.fromCharCode(0))
      .filter((entry) => entry.length > 0)
      .filter((entry) => !BINARY_EXTENSIONS.has(extname(entry).toLowerCase()))
  );
}
