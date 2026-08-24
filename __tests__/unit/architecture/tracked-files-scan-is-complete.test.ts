/**
 * **走査対象の一覧が「途中まで」になったら落ちる。**
 *
 * ## なぜ
 *
 * `__tests__/support/tracked-files.ts` の `trackedTextFiles()` は
 * `referenced-gates-exist` / `source-files-are-text` / `src-doc-pointers-resolve` /
 * `advisory-lock-namespace-registry` の走査根になっている。ここが短い一覧を返すと、
 * gate は**その分だけ見ないまま緑**になる。
 *
 * 実際に起きた（CI の Unit Tests、2026-08-10）: `git ls-files -z` の出力が
 * 途中で切れ、最後の要素が `src/app/(publi` という不完全なパスになった。
 * ファイルを読む gate は `ENOENT` で落ちたが、**落ちた理由がテスト側の欠陥に見える**。
 *
 * 件数の下限（`toBeGreaterThan(500)` など）はこれを捕まえられない。
 * 3,600 件が 2,000 件でも下限は通るからで、下限は「空振り」しか見ていない。
 *
 * ## 何を見るか
 *
 * `parseTrackedFiles()` が、NUL 終端でない入力を**拒否する**こと。
 * 切断そのものの原因（ランタイムの読み取り）はここでは扱わない。
 * ここが保証するのは「切れていたら黙って進まない」だけ。
 */

import { describe, expect, test } from "bun:test";

import {
  parseTrackedFiles,
  trackedTextFiles,
} from "../../support/tracked-files";

const NUL = String.fromCharCode(0);

/** `git ls-files -z` の正常な出力（各パスが NUL で終わる）。 */
function zTerminated(...paths: readonly string[]): Buffer {
  return Buffer.from(paths.map((path) => `${path}${NUL}`).join(""), "utf8");
}

describe("追跡ファイルの一覧は途中で切れたら落ちる", () => {
  test("正常な NUL 終端の出力はそのまま一覧になる", () => {
    expect(
      parseTrackedFiles(zTerminated("src/a.ts", "docs/b.mdx", "e2e/c.spec.ts")),
    ).toEqual(["src/a.ts", "docs/b.mdx", "e2e/c.spec.ts"]);
  });

  test("バイナリ拡張子は落とす（従来の挙動）", () => {
    expect(
      parseTrackedFiles(
        zTerminated("public/logo.png", "src/a.ts", "public/f.woff2"),
      ),
    ).toEqual(["src/a.ts"]);
  });

  test("空の出力は空の一覧（追跡ファイルが無い repo でも落とさない）", () => {
    expect(parseTrackedFiles(Buffer.alloc(0))).toEqual([]);
  });

  test("**NUL で終わっていない出力は拒否する**（これが今回の欠陥そのもの）", () => {
    // 実測された形: 最後のパスが途中で切れ、終端の NUL が無い。
    const truncated = Buffer.from(
      `src/a.ts${NUL}src/app/(publi`, // ← 終端 NUL なし
      "utf8",
    );

    expect(() => parseTrackedFiles(truncated)).toThrow(
      /NUL で終わっていません/u,
    );
  });

  test("切断を素通りさせると不完全なパスが混ざることの証明", () => {
    // ガードが無ければこうなる、を明示する（ガード前の実装と同じ split）。
    const truncated = `src/a.ts${NUL}src/app/(publi`;
    const withoutGuard = truncated.split(NUL).filter((e) => e.length > 0);

    expect(withoutGuard).toEqual(["src/a.ts", "src/app/(publi"]);
    // 件数の下限では捕まらない（2 件あるので「空振り」ではない）。
    expect(withoutGuard.length).toBeGreaterThan(1);
  });

  test("実リポジトリでは十分な件数が返り、すべて実在する", () => {
    const files = trackedTextFiles(process.cwd());

    expect(files.length).toBeGreaterThan(1000);
    // 末尾が切れていれば、この形（拡張子の無い中途半端なパス）が混ざる。
    const suspicious = files.filter((file) => file.endsWith("("));
    expect(suspicious).toEqual([]);
  });
});
