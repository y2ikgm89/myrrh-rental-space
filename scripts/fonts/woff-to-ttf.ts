/**
 * WOFF1 → TTF（非圧縮 SFNT）変換。
 *
 * ## なぜ TTF を同梱するのか
 *
 * `@react-pdf/renderer` は fontkit でフォントをサブセット化して PDF に埋め込む。
 * fontkit の `TTFSubset._addGlyph` は **埋め込むグリフ 1 つごとに**
 * `font._getTableStream('glyf')` を呼ぶが、**WOFF はテーブル単位で zlib 圧縮されている**
 * ため、その都度 数 MB の `glyf` テーブルを展開し直す。結果、埋め込みグリフ数 ×
 * フォント全体のサイズに比例したコストになる。
 *
 * 実測（Noto Sans JP Japanese subset、総グリフ 7,466、埋込 21 グリフ、Node v24）:
 *
 * | 形式  | subset encode | 1 グリフ単価 |
 * | ----- | ------------- | ------------ |
 * | WOFF  | 1,141 ms      | 54.35 ms     |
 * | TTF   | 1.1 ms        | 0.05 ms      |
 *
 * 非圧縮の TTF なら `_getTableStream` が単なる slice になり、この展開が消える。
 * 領収書 PDF の生成は約 4 秒 → 0.1 秒未満になる。
 *
 * ## 使い方
 *
 * フォントを差し替えるときは Fontsource 等から取得した WOFF を変換して
 * `src/shared/pdf/fonts/` に置く:
 *
 * ```sh
 * bun scripts/fonts/woff-to-ttf.ts <input.woff> <output.ttf>
 * ```
 *
 * ## 変換の中身
 *
 * WOFF1 は SFNT の各テーブルを個別に zlib 圧縮しただけのコンテナなので、
 * 展開して table directory を組み直せば TTF になる（グリフのアウトラインは不変）。
 * WOFF 固有の metadata / private データは PDF 埋め込みに不要なので落とす。
 *
 * @see https://www.w3.org/TR/WOFF/
 * @module scripts/fonts/woff-to-ttf
 */

import { readFileSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

interface SfntTable {
  readonly tag: string;
  readonly data: Buffer;
  readonly origChecksum: number;
  offset: number;
}

const WOFF_HEADER_SIZE = 44;
const WOFF_DIRECTORY_ENTRY_SIZE = 20;
const SFNT_DIRECTORY_ENTRY_SIZE = 16;
const SFNT_HEADER_SIZE = 12;

function readWoffTables(woff: Buffer): SfntTable[] {
  if (woff.toString("latin1", 0, 4) !== "wOFF") {
    throw new Error(
      "入力が WOFF1 ではありません（signature が 'wOFF' でない）",
    );
  }

  const numTables = woff.readUInt16BE(12);
  const tables: SfntTable[] = [];

  for (let i = 0; i < numTables; i++) {
    const p = WOFF_HEADER_SIZE + i * WOFF_DIRECTORY_ENTRY_SIZE;
    const tag = woff.toString("latin1", p, p + 4);
    const offset = woff.readUInt32BE(p + 4);
    const compLength = woff.readUInt32BE(p + 8);
    const origLength = woff.readUInt32BE(p + 12);
    const origChecksum = woff.readUInt32BE(p + 16);

    const stored = woff.subarray(offset, offset + compLength);
    // WOFF1 は「圧縮後の方が大きくなるテーブルは無圧縮で格納する」ので、
    // compLength === origLength のときだけ生データ。
    const data = compLength < origLength ? inflateSync(stored) : stored;

    if (data.length !== origLength) {
      throw new Error(
        `テーブル ${tag} の展開後長が不一致: ${String(data.length)} != ${String(origLength)}`,
      );
    }

    tables.push({ tag, data, origChecksum, offset: 0 });
  }

  // SFNT の table directory は tag の昇順であることが要求される。
  return tables.sort((a, b) => a.tag.localeCompare(b.tag, "en"));
}

function buildSfnt(flavor: number, tables: readonly SfntTable[]): Buffer {
  const headerSize =
    SFNT_HEADER_SIZE + tables.length * SFNT_DIRECTORY_ENTRY_SIZE;

  let cursor = headerSize;
  for (const table of tables) {
    table.offset = cursor;
    // 各テーブルは 4 byte 境界に整列する。
    cursor += (table.data.length + 3) & ~3;
  }

  const out = Buffer.alloc(cursor);
  const entrySelector = Math.floor(Math.log2(tables.length));
  const searchRange = 2 ** entrySelector * SFNT_DIRECTORY_ENTRY_SIZE;

  out.writeUInt32BE(flavor, 0);
  out.writeUInt16BE(tables.length, 4);
  out.writeUInt16BE(searchRange, 6);
  out.writeUInt16BE(entrySelector, 8);
  out.writeUInt16BE(
    tables.length * SFNT_DIRECTORY_ENTRY_SIZE - searchRange,
    10,
  );

  tables.forEach((table, i) => {
    const p = SFNT_HEADER_SIZE + i * SFNT_DIRECTORY_ENTRY_SIZE;
    out.write(table.tag, p, 4, "latin1");
    out.writeUInt32BE(table.origChecksum, p + 4);
    out.writeUInt32BE(table.offset, p + 8);
    out.writeUInt32BE(table.data.length, p + 12);
    table.data.copy(out, table.offset);
  });

  return out;
}

function main(): void {
  const [inputPath, outputPath] = process.argv.slice(2);
  if (!inputPath || !outputPath) {
    throw new Error(
      "使い方: bun scripts/fonts/woff-to-ttf.ts <input.woff> <output.ttf>",
    );
  }

  const woff = readFileSync(inputPath);
  const flavor = woff.readUInt32BE(4);
  const tables = readWoffTables(woff);
  const ttf = buildSfnt(flavor, tables);

  writeFileSync(outputPath, ttf);
  console.log(
    `${inputPath} (${String(woff.length)} B) → ${outputPath} (${String(ttf.length)} B), tables=${String(tables.length)}`,
  );
}

main();
