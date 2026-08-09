/**
 * ドキュメントが指す Playwright 公式 Docker イメージのタグが、**実際に install
 * される** Playwright の版数（`bun.lock` の解決済みエントリ）と一致していることの gate。
 *
 * ## なぜ
 *
 * 「CI と同じ描画をローカルで得たいときは
 * `mcr.microsoft.com/playwright:v<version>-noble` を使う」という案内が
 * rules と spec の JSDoc の **2 箇所**に版数直書きで存在する。`@playwright/test` を
 * 上げたときにここが取り残されると、案内どおりに使った人は**CI と違うブラウザ**で
 * baseline を作る（visual regression では即座に偽の差分になる）。
 *
 * 版数を定数にできない場所（散文・JSDoc）なので、**一致を機械で見る**。
 *
 * 比較相手は `package.json` の宣言（`~1.62.1`）**ではない**。Renovate の
 * `lockFileMaintenance`（weekly / automerge）は lock だけを 1.62.x の後続へ
 * 進められるので、宣言を見ていると「宣言が動いていないから docs も正しい」と
 * 誤判定する。CI が実際に入れる版数＝lock の解決済みエントリを見る。
 *
 * ## 走査範囲
 *
 * 置き場所で範囲を決めない。追跡されているテキストファイル全体から
 * `mcr.microsoft.com/playwright:v…` を拾う（`.claude/rules` と `e2e/` だけを
 * 見ていると、3 箇所目が増えたときに黙って見逃す）。
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { trackedTextFiles } from "../../support/tracked-files";

const ROOT = process.cwd();

/**
 * `mcr.microsoft.com/playwright:v<version>-noble` の形の参照を拾う。
 *
 * ここに具体的な版数を書かない — このファイル自身が実走査の対象なので、
 * 例示のつもりの版数が「取り残された参照」として報告される。
 */
const IMAGE_REFERENCE = /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-/gu;

/**
 * `bun.lock` から **実際に install される** `@playwright/test` の版数を取り出す。
 *
 * `package.json` の宣言（`~1.62.1`）を読むと、Renovate の
 * `lockFileMaintenance`（`.github/renovate.json5`、weekly / automerge）が
 * lock だけを 1.62.x の後続へ進めたときに**宣言は動かない**。docs のイメージ
 * タグは「CI が入れる Playwright」と揃っていないと意味が無いので、範囲の下限
 * ではなく解決済みの版数を見る。
 *
 * lock は JSONC なので JSON.parse は使わず、解決済みエントリの形
 * （`"@playwright/test": ["@playwright/test@1.62.1", …]`）を直接読む。
 * 同じファイルには宣言側の `"@playwright/test": "~1.62.1"` も現れるので、
 * **配列 + `name@version` の形**でしか一致しないようにしてある。
 */
export function resolvedPlaywrightVersion(bunLock: string): string {
  const match =
    /"@playwright\/test":\s*\[\s*"@playwright\/test@(\d+\.\d+\.\d+[^"]*)"/u.exec(
      bunLock,
    );
  const version = match?.[1];
  if (!version) {
    throw new Error(
      "bun.lock に @playwright/test の解決済みエントリが見つからない",
    );
  }
  return version;
}

/**
 * pin と食い違うイメージ参照を返す（**純粋関数**）。
 *
 * 実走査も fixture もこの 1 つを呼ぶ（合成部分が検証されない分岐を作らない）。
 */
export function mismatchedImageReferences(
  pinnedVersion: string,
  sources: readonly { readonly file: string; readonly source: string }[],
): string[] {
  const out: string[] = [];
  for (const { file, source } of sources) {
    for (const match of source.matchAll(IMAGE_REFERENCE)) {
      const found = match[1];
      if (found !== undefined && found !== pinnedVersion) {
        out.push(
          `${file}: Playwright イメージが v${found} を指しているが pin は ${pinnedVersion}`,
        );
      }
    }
  }
  return out;
}

/** 参照が何件見つかったか（gate が空振りしていないことの自己検査に使う）。 */
export function countImageReferences(
  sources: readonly { readonly file: string; readonly source: string }[],
): number {
  return sources.reduce(
    (total, { source }) => total + [...source.matchAll(IMAGE_REFERENCE)].length,
    0,
  );
}

function scannedSources(): { file: string; source: string }[] {
  return trackedTextFiles(ROOT).map((file) => ({
    file,
    source: readFileSync(join(ROOT, file), "utf8"),
  }));
}

describe("Playwright の Docker イメージ参照", () => {
  const pinned = resolvedPlaywrightVersion(
    readFileSync(join(ROOT, "bun.lock"), "utf8"),
  );

  test("解決済み版数の読み取りが壊れていない", () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+/u);

    // 解決済みエントリを読む
    expect(
      resolvedPlaywrightVersion(
        '  "@playwright/test": ["@playwright/test@1.62.3", "", {}, "sha512-x"],',
      ),
    ).toBe("1.62.3");

    // **宣言側の範囲は拾わない。** ここを取り違えると lock だけが進んだときに
    // 「宣言は 1.62.1 のままなので docs も 1.62.1 で正しい」と誤判定する。
    expect(() =>
      resolvedPlaywrightVersion('        "@playwright/test": "~1.62.1",'),
    ).toThrow();

    // 宣言と解決済みが同居していても解決済みを選ぶ
    expect(
      resolvedPlaywrightVersion(
        '        "@playwright/test": "~1.62.1",\n' +
          '    "@playwright/test": ["@playwright/test@1.62.9", "", {}, "sha512-y"],',
      ),
    ).toBe("1.62.9");
  });

  test("参照が 1 件以上見つかる（gate が空振りしていない）", () => {
    // 案内が消えたのか、正規表現が腐ったのかを区別できるようにする。
    expect(countImageReferences(scannedSources())).toBeGreaterThan(0);
  });

  test("すべての参照が pin と一致する", () => {
    expect(mismatchedImageReferences(pinned, scannedSources())).toEqual([]);
  });

  test("判定の見本（gate の判別力）", () => {
    // 見本の文字列は**連結して組み立てる**。リテラルで書くとこのファイル自身が
    // 実走査に拾われ、gate が自分の fixture を違反として報告してしまう
    // （走査対象を「このファイル以外」に狭める免除より、当たらない形で書くほうが
    // 免除の粒度を説明せずに済む）。
    const image = (version: string) =>
      `mcr.microsoft.com/playwright:v${version}-noble`;

    const stale = [{ file: "a.md", source: image("1.61.1") }];
    const current = [{ file: "b.md", source: image("1.62.1") }];
    const unrelated = [
      { file: "c.md", source: "mcr.microsoft.com/dotnet/sdk:v1.61.1-noble" },
    ];

    // 1. 取り残された参照が落ちる
    expect(mismatchedImageReferences("1.62.1", stale)).toHaveLength(1);
    // 2. 一致する参照は通る
    expect(mismatchedImageReferences("1.62.1", current)).toEqual([]);
    // 3. 別のイメージは対象外
    expect(mismatchedImageReferences("1.62.1", unrelated)).toEqual([]);
    // 4. 空振り検出そのものの見本
    expect(countImageReferences(current)).toBe(1);
    expect(countImageReferences(unrelated)).toBe(0);
  });
});
