/**
 * **「これは X.test.ts が検証する」と書いたなら、X.test.ts は実在しなければならない。**
 *
 * ## なぜ
 *
 * コードやトークンの横に書かれた「gate は …」「検証: …」は、読む人にとって
 * **その値が機械検証されているという主張**になる。指した先が無いと主張は嘘になり、
 * 読んだ人は次のどちらかをする:
 *
 * - 「未検証なのか」と判断して、その値を信用しなくなる
 * - 「gate が消えたのか」と判断して、既にある別名の gate と重複する gate を書く
 *
 * どちらも実害があり、しかも**何も落ちない**ので放置される。
 *
 * 実例（この gate を入れた時点で 2 件）: `admin.css` と `SpaceManagementTabs.tsx` は
 * コントラスト比を `admin-sidebar-contrast.test.ts` が検証すると書いていたが、
 * 実際に検証しているのは `admin-feature-disabled-contrast.test.ts` だった。
 * `prisma/seed.ts` の advisory lock namespace も同様に、実際は
 * `seed-reservation-rebuild-safety.test.ts` が突合していた。
 * **どちらも検証自体は存在した** — 嘘だったのは名前だけ。それでも、名前を頼りに
 * 探した人には「検証が無い」と映る。
 *
 * ## 何を見るか
 *
 * 走査対象に現れる `__tests__/…/*.test.ts(x)` のパスが、すべて実在すること。
 * allowlist は置かない。「実在しないテストを指してよい理由」が無いため。
 *
 * テストの**中身**が主張どおりかまでは見ない（静的には確かめられない）。
 * ここが保証するのは「名前が解決すること」だけで、それ以上を主張しない。
 *
 * ## 走査対象
 *
 * `__tests__/**` 自身は**対象外**。テスト間の相互参照には「この形は禁止」を
 * 示すための架空パスが混ざりうるうえ、消えた gate を名指しして「もう無い」と
 * 書く clean-break テストが成立しなくなる。守りたいのは
 * **実装・設定・エージェント指示から張られたポインタ**なので、そちらだけを見る。
 */

import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT = process.cwd();

/** `__tests__/…/<name>.test.ts` / `.test.tsx` の参照。 */
const TEST_FILE_REFERENCE = /__tests__\/[A-Za-z0-9_./()@-]+\.test\.tsx?/gu;

const SCAN: readonly { readonly dir: string; readonly glob: string }[] = [
  { dir: "src", glob: "**/*.{ts,tsx,css}" },
  { dir: "scripts", glob: "**/*.{ts,sh}" },
  { dir: "prisma", glob: "*.{ts,prisma}" },
  { dir: ".claude", glob: "**/*.md" },
  { dir: ".agents", glob: "**/*.md" },
  { dir: ".github", glob: "**/*.{yml,yaml,md}" },
  { dir: ".", glob: "{CLAUDE,AGENTS}.md" },
];

function scannedFiles(): string[] {
  const out: string[] = [];
  for (const entry of SCAN) {
    const glob = new Bun.Glob(entry.glob);
    for (const file of glob.scanSync({
      cwd: join(ROOT, entry.dir),
      absolute: true,
    })) {
      out.push(file);
    }
  }
  return out;
}

/** そのテキストが指しているテストファイル（repo 相対・重複排除）。 */
export function referencedTestPaths(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(TEST_FILE_REFERENCE)) {
    found.add(match[0]);
  }
  return [...found];
}

describe("散文が指す gate は実在する", () => {
  test("走査対象が実在する（gate 自体が空振りしていない）", () => {
    const files = scannedFiles();
    expect(files.length).toBeGreaterThan(1000);
    for (const entry of SCAN) {
      const glob = new Bun.Glob(entry.glob);
      const count = [
        ...glob.scanSync({ cwd: join(ROOT, entry.dir), absolute: true }),
      ].length;
      expect({ dir: entry.dir, empty: count === 0 }).toEqual({
        dir: entry.dir,
        empty: false,
      });
    }
  });

  test("参照の抽出が効いている（fixture）", () => {
    expect(
      referencedTestPaths(
        "// gate は `__tests__/unit/architecture/foo-bar.test.ts`",
      ),
    ).toEqual(["__tests__/unit/architecture/foo-bar.test.ts"]);
    expect(
      referencedTestPaths("検証: __tests__/unit/forms/baz.test.tsx が強制する"),
    ).toEqual(["__tests__/unit/forms/baz.test.tsx"]);
    // 同じ参照が 2 回出ても 1 件。
    expect(
      referencedTestPaths(
        "__tests__/unit/a.test.ts と __tests__/unit/a.test.ts",
      ),
    ).toEqual(["__tests__/unit/a.test.ts"]);
    // テストファイルでないものは拾わない。
    expect(referencedTestPaths("__tests__/support/prisma-sources.ts")).toEqual(
      [],
    );
    expect(referencedTestPaths("src/shared/db/prisma.ts")).toEqual([]);
  });

  test("実在しないテストを指している箇所が無い", () => {
    const offenders: string[] = [];

    for (const file of scannedFiles()) {
      const missing = referencedTestPaths(readFileSync(file, "utf8")).filter(
        (path) => !existsSync(join(ROOT, path)),
      );
      if (missing.length === 0) continue;
      offenders.push(
        `${relative(ROOT, file).replaceAll("\\", "/")} :: ${missing.join(", ")}`,
      );
    }

    expect({
      offenders,
      hint:
        offenders.length > 0
          ? "「X.test.ts が検証する」は、読む人にとって機械検証されているという主張になる。指す先が無いなら、実際に検証している gate の名前へ直す（無いなら主張ごと消す）"
          : "",
    }).toEqual({ offenders: [], hint: "" });
  });
});
