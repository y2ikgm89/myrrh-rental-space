/**
 * ドキュメントが指す Playwright 公式 Docker イメージのタグが、`package.json` の
 * pin と一致していることの gate。
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

/** `mcr.microsoft.com/playwright:v1.62.1-noble` のような参照を拾う。 */
const IMAGE_REFERENCE = /mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-/gu;

/** `package.json` の `@playwright/test` pin から版数だけを取り出す。 */
export function pinnedPlaywrightVersion(packageJson: string): string {
  const parsed: unknown = JSON.parse(packageJson);
  const dev =
    typeof parsed === "object" && parsed !== null && "devDependencies" in parsed
      ? (parsed as { devDependencies: Record<string, string> }).devDependencies
      : {};
  const range = dev["@playwright/test"];
  if (typeof range !== "string") {
    throw new Error("@playwright/test が devDependencies にない");
  }
  const version = /(\d+\.\d+\.\d+)/u.exec(range)?.[1];
  if (!version) {
    throw new Error(`@playwright/test の pin から版数を取れない: ${range}`);
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
  const pinned = pinnedPlaywrightVersion(
    readFileSync(join(ROOT, "package.json"), "utf8"),
  );

  test("pin の読み取りが壊れていない", () => {
    expect(pinned).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(
      pinnedPlaywrightVersion(
        '{"devDependencies":{"@playwright/test":"~1.62.1"}}',
      ),
    ).toBe("1.62.1");
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
