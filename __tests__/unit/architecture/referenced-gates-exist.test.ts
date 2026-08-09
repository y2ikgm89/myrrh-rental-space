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
 * ## 走査対象は git に聞く
 *
 * 初版は `src` / `scripts` / `prisma` … とディレクトリを列挙していた。
 * その結果 `Dockerfile` / `eslint.config.mjs` / `lefthook.yml` /
 * `.github/CODEOWNERS` にある**実在するポインタを
 * 1 件も見ていなかった**（Codex が PR #2010 で指摘）。この repo は同じ失敗を
 * `source-files-are-text` でも踏んでいる — **手書きのディレクトリ一覧は必ず漏れる**。
 *
 * tracked file 全体を見て、次の 2 つだけ外す:
 *
 * - `__tests__/**` — テスト間の相互参照には「この形は禁止」を示す架空パスが
 *   混ざりうるうえ、消えた gate を名指しして「もう無い」と書く clean-break
 *   テストが成立しなくなる
 * - `docs/superpowers/**` `docs/audits/**` `docs/investigation/**` — 日付入りの
 *   記録。当時の事実を書いたもので、指示ではない
 *   （`gates-do-not-pin-migrations` と同じ線引き）
 *
 * ## 「docs は記録だから」を docs 全体に広げない
 *
 * 初版は `docs/` を丸ごと外していた。だが docs 配下には runbook・ADR・alerting と
 * いった**人が従う指示**が同居していて、そこに実在しない gate 名を書けば
 * 上の docstring が説明した実害がそのまま起きる。除外の根拠（記録である）が
 * 当てはまるのは 3 つの置き場だけなので、そこだけ外す。
 *
 * 狭める前に実測した: 指示側の 5 参照は 0 件破損、記録側の 151 参照は 20 件破損。
 * つまりこの線引きは今日そのまま通り、以後は指示文書だけが守られる。
 * 置き場の区別は `docs/README.md` が説明する。
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { trackedTextFiles } from "../../support/tracked-files";

const ROOT = process.cwd();

/** `__tests__/…/<name>.test.ts` / `.test.tsx` の参照。 */
const TEST_FILE_REFERENCE = /__tests__\/[A-Za-z0-9_./()@-]+\.test\.tsx?/gu;

/** 参照が古びてよい場所。理由は docstring 参照。 */
const EXCLUDED_PREFIXES = [
  "__tests__/",
  "docs/superpowers/",
  "docs/audits/",
  "docs/investigation/",
] as const;

/** 除外が広がりすぎて指示文書ごと落ちていないことの見張り。 */
const SCANNED_DOC_SAMPLES = [
  "docs/runbooks/encryption-key-rotation.md",
  "docs/observability/alerting.md",
  "docs/adr/README.md",
] as const;

function scannedFiles(): string[] {
  return trackedTextFiles(ROOT).filter(
    (file) => !EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix)),
  );
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
    // git 呼び出しが壊れると 0 件で緑になる。
    const files = scannedFiles();
    expect(files.length).toBeGreaterThan(1000);

    // 除外は「記録の置き場」だけ。指示文書まで巻き込むと、この gate は
    // docs に対して何も言わない状態へ静かに戻る。
    const scanned = new Set(files);
    for (const doc of SCANNED_DOC_SAMPLES) {
      expect({ doc, scanned: scanned.has(doc) }).toEqual({
        doc,
        scanned: true,
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
      offenders.push(`${file} :: ${missing.join(", ")}`);
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
