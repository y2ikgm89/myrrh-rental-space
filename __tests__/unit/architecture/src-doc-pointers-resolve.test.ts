/**
 * **`src/` のコメントが名指しする `*.md` は、リポジトリに実在しなければならない。**
 *
 * ## なぜ
 *
 * `src/` のコメントには `caching.md` `db-domain.md` のように**裸のファイル名**で
 * 規約文書を指す書き方が積み上がっていた。指す先はエージェント設定
 * (`.claude/rules/`) で、これは flat → 入れ子 → flat → 削除 と何度も組み替わる。
 * 組み替わるたびにコメントは黙って壊れ、**誰も気づかない**。
 *
 * 実測（2026-08-10、9 箇所を直す直前）では、参照先が 3 世代に分かれていた:
 *
 * - `caching.md` / `db-domain.md` / `security-auth.md` / `business-domain.md`
 *   — 直前の世代（`.claude/rules/` 直下）
 * - `dialogs.md` → `.claude/rules/frontend/admin-ui/dialogs.md`,
 *   `lexical-patterns.md` → `.claude/rules/frontend/`,
 *   `images-text.md` → `.claude/rules/frontend/accessibility/`
 *   — **さらに前の入れ子構成**。つまり削除より前から既に壊れていた
 * - `configuration.md` / `task-1-report.md` — git 履歴に一度も存在しない
 *
 * `referenced-gates-exist` は `__tests__/…/*.test.ts` のパスしか見ないので、
 * この形は素通りしていた。
 *
 * ## 何を見るか
 *
 * `src/` に現れる `<name>.md` が tracked file として解決すること。allowlist は
 * 置かない。`src/` にテスト用の合成 fixture は無いので、除外すべきものが無い
 * （実測: 解決する `*.md` 参照は 0 件、解決しないものだけが 9 件あった）。
 *
 * 文書の**中身**が主張どおりかまでは見ない。ここが保証するのは「名前が
 * 解決すること」だけ。
 *
 * ## 直し方
 *
 * リポジトリの外（エージェント設定）を指し直さないこと。次の組み替えでまた壊れる。
 *
 * - 周囲の文が既に内容を持つなら、ポインタを**落とす**
 * - 規約が生きていて後継文書が無いなら、1〜2 文をその場に**書く**
 * - 同じ不変条件を強制している gate / ESLint ルール / `docs/` があるなら、
 *   そこを指す（gate 名は `referenced-gates-exist` が実在を強制する）
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

import { describe, expect, test } from "bun:test";

import { trackedTextFiles } from "../../support/tracked-files";

const ROOT = process.cwd();

/** パス区切りや語の途中を拾わない、裸の markdown ファイル名。 */
const MARKDOWN_FILENAME = /(?<![\w/.-])([a-z][a-z0-9-]*\.md)\b/gu;

export function findMarkdownFilenames(source: string): string[] {
  return [...source.matchAll(MARKDOWN_FILENAME)].map((m) => m[1] ?? "");
}

function scannedFiles(): string[] {
  return trackedTextFiles(ROOT).filter(
    (file) =>
      file.startsWith("src/") &&
      (file.endsWith(".ts") || file.endsWith(".tsx")),
  );
}

describe("src が名指しする markdown は実在する", () => {
  test("走査対象が実在する（gate が空振りしていない）", () => {
    expect(scannedFiles().length).toBeGreaterThan(500);
  });

  test("抽出が効いている（見本）", () => {
    expect(findMarkdownFilenames("// 詳細は caching.md。")).toEqual([
      "caching.md",
    ]);
    expect(findMarkdownFilenames("* (`dialogs.md` Variant B)")).toEqual([
      "dialogs.md",
    ]);
    // パスの一部は拾わない（それは別 gate の担当か、そもそも解決する）。
    expect(findMarkdownFilenames("docs/api-conventions.md")).toEqual([]);
    expect(findMarkdownFilenames("https://nextjs.org/docs/guide.md")).toEqual(
      [],
    );
  });

  test("実在しない markdown を名指ししている箇所が無い", () => {
    const tracked = new Set(
      trackedTextFiles(ROOT).map((file) => basename(file)),
    );
    const offenders: string[] = [];

    for (const file of scannedFiles()) {
      const missing = findMarkdownFilenames(readFileSync(file, "utf8")).filter(
        (name) => !tracked.has(name),
      );
      if (missing.length === 0) continue;
      offenders.push(`${file} :: ${[...new Set(missing)].join(", ")}`);
    }

    expect({
      offenders,
      hint:
        offenders.length > 0
          ? "リポジトリ外（エージェント設定）を指し直さない — 次の組み替えでまた壊れる。ポインタを落とすか、規約を 1〜2 文その場に書くか、同じ不変条件を強制している gate を指す"
          : "",
    }).toEqual({ offenders: [], hint: "" });
  });
});
