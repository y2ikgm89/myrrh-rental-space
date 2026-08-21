import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

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

/**
 * `git ls-files -z` の生出力を一覧にする。**切断されていたら落とす。**
 *
 * ## なぜ検出が要るのか
 *
 * `-z` の出力は必ず NUL 終端。途中で切れたまま `split` すると、最後の要素が
 * **不完全なパス**になる（`split` は終端が無くても残りを 1 要素として返す）。
 *
 * 実際に起きた（CI の Unit Tests、2026-08-10）: `src/app/(publi` が返り、
 * `advisory-lock-namespace-registry` が
 * `ENOENT: no such file or directory` で落ちた。原因が「読み取りの切断」だと
 * 分かるまで、テストの中身を疑うことになる。
 *
 * さらに悪いのは**件数が黙って減る**こと。この一覧を使う gate は
 * `expect(files.length).toBeGreaterThan(500)` のような下限しか持たないので、
 * 3,600 件が 2,000 件になっても下限は通る。読まずに名前だけ見る判定を足した
 * 瞬間に、走査漏れが無言で成立する。
 *
 * ここで落とせば、少なくとも**何が起きたかを名指しできる**。切断そのものの
 * 原因（ランタイム側の読み取り）は再現できていないので、直したふりはしない。
 */
export function parseTrackedFiles(stdout: Buffer): string[] {
  if (stdout.length > 0 && stdout.at(-1) !== 0) {
    const tail = stdout.subarray(Math.max(0, stdout.length - 60)).toString();
    throw new Error(
      `git ls-files -z の出力が NUL で終わっていません（読み取りが途中で切れた）。` +
        `件数と最後のパスが信用できないので中断します。末尾: ${JSON.stringify(tail)}`,
    );
  }

  return (
    stdout
      .toString("utf8")
      // NUL は**実文字を書かない**（source-files-are-text の指針）。
      .split(String.fromCharCode(0))
      .filter((entry) => entry.length > 0)
      .filter((entry) => !BINARY_EXTENSIONS.has(extname(entry).toLowerCase()))
  );
}

/** git が追跡しているテキストファイル（repo 相対・POSIX 区切り）。 */
export function trackedTextFiles(root: string): string[] {
  // `execFileSync` の pipe 読み取りは bun で稀に途中で切れる（CI Unit Tests で
  // 2026-08-10 と 2026-08-20 の 2 回観測。3,600+ 件・~150KB の出力が中腹で
  // 切断され、parseTrackedFiles の NUL 終端検査が落ちた）。pipe を介さず、
  // shell リダイレクトで一時ファイルへ git に直接書かせてから読む。
  // 切断検査（parseTrackedFiles 側）はそのまま残す。
  const dir = mkdtempSync(join(tmpdir(), "tracked-files-"));
  try {
    const outFile = join(dir, "ls-files.txt");
    execSync(`git ls-files -z > "${outFile}"`, { cwd: root });
    return parseTrackedFiles(readFileSync(outFile));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
