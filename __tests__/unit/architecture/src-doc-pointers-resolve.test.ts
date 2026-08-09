/**
 * **コメントが名指しする `*.md` は、リポジトリに実在しなければならない。**
 *
 * ## なぜ
 *
 * `src/` のコメントには `caching` `db-domain` のような**裸のファイル名**（拡張子付き）で
 * 規約文書を指す書き方が積み上がっていた。指す先はエージェント設定
 * (`.claude/rules/`) で、これは flat → 入れ子 → flat → 削除 と何度も組み替わる。
 * 組み替わるたびにコメントは黙って壊れ、**誰も気づかない**。
 *
 * 実測（2026-08-10、9 箇所を直す直前）では、参照先が 3 世代に分かれていた:
 *
 * - `caching` / `db-domain` / `security-auth` / `business-domain`
 *   — 直前の世代（`.claude/rules/` 直下）
 * - `dialogs` は `.claude/rules/frontend/admin-ui/`、`lexical-patterns` は
 *   `.claude/rules/frontend/`、`images-text` は
 *   `.claude/rules/frontend/accessibility/` — **さらに前の入れ子構成**。
 *   つまり削除より前から既に壊れていた
 * - `configuration` / `task-1-report` — git 履歴に一度も存在しない
 *
 * （この docstring 自身が走査対象なので、例は拡張子を付けずに書く。付けると
 * この gate が自分を違反として数える。）
 *
 * `referenced-gates-exist` は `__tests__/…/*.test.ts` のパスしか見ないので、
 * この形は素通りしていた。
 *
 * ## 何を見るか
 *
 * `src/` `__tests__/` `e2e/` に現れる `<name>.md` が tracked file として解決すること。
 * **allowlist は置かない。**
 *
 * テストの合成 fixture は「これは fixture だから」という免除の抜け道になるので、
 * 名前の側を直す — `playwright-docker-image-tag` のラベルは 1 文字＋拡張子ではなく
 * `fixture-stale` のように**形で fixture と分かる名前**にしてある
 * （`gates-do-not-pin-migrations` の「合成 fixture について」と同じ流儀）。
 *
 * この gate 自身の見本だけは実在しない名前が要る（検出できることの証明だから）。
 * ソースにリテラルで置くと自分を違反として数えるので、**実行時に組み立てる**。
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

/** 走査するツリー。散文の置き場 (`docs/`) は対象外 — あちらは相対リンクで書く。 */
const SCANNED_PREFIXES = ["src/", "__tests__/", "e2e/"] as const;

function scannedFiles(): string[] {
  return trackedTextFiles(ROOT).filter(
    (file) =>
      SCANNED_PREFIXES.some((prefix) => file.startsWith(prefix)) &&
      (file.endsWith(".ts") || file.endsWith(".tsx")),
  );
}

describe("コードが名指しする markdown は実在する", () => {
  test("走査対象が実在する（gate が空振りしていない）", () => {
    const files = scannedFiles();
    expect(files.length).toBeGreaterThan(500);
    // 3 つのツリーそれぞれが 1 件も拾えていない、を個別に弾く。
    for (const prefix of SCANNED_PREFIXES) {
      expect({
        prefix,
        empty: !files.some((file) => file.startsWith(prefix)),
      }).toEqual({ prefix, empty: false });
    }
  });

  test("抽出が効いている（見本）", () => {
    // リテラルで書くと自分を違反として数えるので実行時に組み立てる。
    const md = (stem: string): string => `${stem}.${"md"}`;

    expect(findMarkdownFilenames(`// 詳細は ${md("caching")}。`)).toEqual([
      md("caching"),
    ]);
    expect(findMarkdownFilenames(`* (\`${md("dialogs")}\` Variant B)`)).toEqual(
      [md("dialogs")],
    );
    // パスの一部は拾わない（それは別 gate の担当か、そもそも解決する）。
    expect(findMarkdownFilenames(`docs/${md("api-conventions")}`)).toEqual([]);
    expect(
      findMarkdownFilenames(`https://nextjs.org/docs/${md("guide")}`),
    ).toEqual([]);
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
