import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * 領収書 PDF のフォント資産が **非圧縮 SFNT (TTF)** であることの gate。
 *
 * ## なぜ
 *
 * `@react-pdf/renderer` は fontkit でフォントをサブセット化して埋め込む。
 * fontkit の `TTFSubset._addGlyph` は **埋め込むグリフ 1 つごとに**
 * `font._getTableStream('glyf')` を呼ぶ。WOFF はテーブル単位で zlib 圧縮されている
 * ため、その都度 数 MB の `glyf` テーブルを展開し直す。
 *
 * 実測 (Noto Sans JP Japanese subset、総グリフ 7,466、埋込 21 グリフ):
 *
 * | 形式 | subset encode | 1 グリフ単価 |
 * | ---- | ------------- | ------------ |
 * | WOFF | 1,141 ms      | 54.35 ms     |
 * | TTF  | 1.1 ms        | 0.05 ms      |
 *
 * 領収書 1 通の生成が 3,874 ms → 39 ms（約 100 倍）になった。**WOFF / WOFF2 に
 * 戻すと会員のダウンロードが再び数秒待ちになる**ため機械固定する。
 * 差し替え手順は `scripts/fonts/woff-to-ttf.ts`。
 */

const FONT_DIR = join(process.cwd(), "src", "shared", "pdf", "fonts");
const RECEIPT_DOCUMENT = join(
  process.cwd(),
  "src",
  "shared",
  "pdf",
  "receipt-document.tsx",
);

describe("receipt PDF font asset", () => {
  test("同梱フォントは圧縮コンテナ (WOFF / WOFF2) ではない", () => {
    const compressed = readdirSync(FONT_DIR).filter(
      (name) => name.endsWith(".woff") || name.endsWith(".woff2"),
    );

    expect(compressed).toEqual([]);
  });

  test("同梱フォントの signature が非圧縮 SFNT である", () => {
    const fonts = readdirSync(FONT_DIR).filter((name) => name.endsWith(".ttf"));
    expect(fonts.length).toBeGreaterThan(0);

    for (const name of fonts) {
      const head = readFileSync(join(FONT_DIR, name)).subarray(0, 4);
      // TrueType outline の SFNT は 0x00010000、CFF は 'OTTO'。
      // 'wOFF' / 'wOF2' はこの gate が防ぐ対象。
      const isTrueType = head.readUInt32BE(0) === 0x00010000;
      const isCff = head.toString("latin1") === "OTTO";
      expect(
        `${name}: ${isTrueType || isCff ? "sfnt" : head.toString("latin1")}`,
      ).toBe(`${name}: sfnt`);
    }
  });

  test("table directory が tag のバイト列昇順である", () => {
    // SFNT の必須要件。`localeCompare` で並べると `cmap` が `GDEF` より前に来て
    // directory を binary search する consumer がテーブルを見つけられなくなる。
    for (const name of readdirSync(FONT_DIR).filter((f) =>
      f.endsWith(".ttf"),
    )) {
      const font = readFileSync(join(FONT_DIR, name));
      const numTables = font.readUInt16BE(4);
      const tags = Array.from({ length: numTables }, (_, i) =>
        font.toString("latin1", 12 + i * 16, 16 + i * 16),
      );

      expect(`${name}: ${tags.join(" ")}`).toBe(
        `${name}: ${[...tags].sort().join(" ")}`,
      );
    }
  });

  test("head.checkSumAdjustment が再計算されている", () => {
    // table offset を組み直したのに WOFF の値を引き継ぐと、フォント全体の
    // checksum が仕様の 0xB1B0AFBA にならず SFNT を検証する consumer に弾かれうる。
    for (const name of readdirSync(FONT_DIR).filter((f) =>
      f.endsWith(".ttf"),
    )) {
      const font = readFileSync(join(FONT_DIR, name));
      let checksum = 0;
      for (let i = 0; i + 4 <= font.length; i += 4) {
        checksum = (checksum + font.readUInt32BE(i)) >>> 0;
      }

      expect(`${name}: 0x${checksum.toString(16)}`).toBe(`${name}: 0xb1b0afba`);
    }
  });

  test("receipt-document.tsx が参照するフォント名が .ttf である", () => {
    const source = readFileSync(RECEIPT_DOCUMENT, { encoding: "utf8" });

    // **解説文ではなく引用符付きのファイル名リテラルだけ**を見る。
    // 「なぜ WOFF を使わないか」は JSDoc に書いてあるので、素朴な
    // `not.toContain(".woff")` は自分のコメントを誤検出する。
    const fontLiterals = [
      ...source.matchAll(/"([\w.-]+\.woff2?|[\w.-]+\.ttf)"/gu),
    ]
      .map((m) => m[1])
      .filter((name): name is string => name !== undefined);

    expect(fontLiterals.length).toBeGreaterThan(0);
    expect(fontLiterals.filter((name) => name.includes(".woff"))).toEqual([]);
  });
});
