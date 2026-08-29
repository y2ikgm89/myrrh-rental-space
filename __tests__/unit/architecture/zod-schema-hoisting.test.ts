/**
 * スキーマを**組み立てたその式で parse していない**ことを固定する。
 *
 * ## なぜ
 *
 * Zod のスキーマ構築は parse より一桁重い。実測（Node / V8）:
 *
 * - `z.uuid()` — 構築 1745 ns に対し parse 359 ns
 * - `z.array(spanSchema)` — 構築 696 ns に対し parse 135 ns
 * - portable-text の span 配列 factory — 構築 4298 ns に対し parse 484 ns
 *
 * `z.uuid().safeParse(id)` と書くと**呼び出しのたびに組み直す**。
 * `parseLabelSpans`（ナビ 1 項目ごと・全公開ページ描画）が実際にこの形で、
 * 6517 ns 掛かっていたものが module スコープへ上げるだけで 484 ns になった
 * （13.5 倍）。スキーマは immutable なので共有して問題ない。
 *
 * ## 何を見るか
 *
 * `src` の `.ts` / `.tsx` で、`z.<なにか>(…)` の戻り値へそのまま
 * `.parse` / `.safeParse`（および async 版）を繋いでいる式。
 * `__tests__` は対象外 — テストが 1 回きりのスキーマを組んで parse するのは正当。
 *
 * ## 直し方
 *
 * スキーマを module スコープの `const` へ上げ、呼び出し側はそれを参照する。
 * ファイル内に既に同義の `const idSchema = uuidIdSchema("…")` があるならそれを使う。
 *
 * **`.register()` を掛ける経路では共有しないこと。** `field.portableTextInline()`
 * は戻り値へ `.register(fieldRegistry, { label, … })` を掛けるので、インスタンスを
 * 共有すると全フィールドが 1 つの registry エントリを奪い合いラベルが壊れる。
 * その形はこの gate の対象外（`.parse` を繋いでいないため）。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  collectSourceFiles,
  stripComments,
} from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/**
 * `z.foo(...)` の直後に `.parse` / `.safeParse` が繋がる形。
 *
 * `[^;]` で 1 文（prettier がセミコロンを必ず置く）に閉じ込める。`z` と `.foo`
 * の間の空白を許すのは、prettier が長い式を `z\n  .array(...)` と折るため
 * （ここを空白なしで書くと、折られた違反を丸ごと見逃す）。
 */
const CONSTRUCT_AND_PARSE =
  /\bz\s*\.\s*\w+\s*\([^;]*?\)\s*\.\s*(?:safeParse|parse)(?:Async)?\s*\(/gu;

/** 空振り検知用。スキーマを parse している式そのものの総数。 */
const ANY_PARSE = /\.\s*(?:safeParse|parse)(?:Async)?\s*\(/gu;

function violations(sample: string): string[] {
  return [...sample.matchAll(CONSTRUCT_AND_PARSE)].map((m) => m[0]);
}

describe("Zod スキーマの巻き上げ", () => {
  test("見本: 構築と parse を同じ式で書いた形は落ちる", () => {
    expect(violations(`const r = z.uuid().safeParse(id);`)).toHaveLength(1);
    expect(
      violations(`const r = z.array(spanSchema).safeParse(value);`),
    ).toHaveLength(1);
    expect(
      violations(`const r = z.uuid({ error: "IDが不正です" }).safeParse(id);`),
    ).toHaveLength(1);
    // prettier が折った形も拾う（折られた違反を見逃さないことの固定）
    expect(
      violations(`const r = z\n  .array(spanSchema)\n  .safeParse(value);`),
    ).toHaveLength(1);
    expect(
      violations(`const r = await z.string().safeParseAsync(v);`),
    ).toHaveLength(1);
  });

  test("見本: 巻き上げ済み・構築のみ・z.validate は落ちない", () => {
    expect(violations(`const r = idSchema.safeParse(id);`)).toEqual([]);
    expect(violations(`const r = spanArraySchema.safeParse(value);`)).toEqual(
      [],
    );
    expect(violations(`const idSchema = z.uuid({ error: "x" });`)).toEqual([]);
    expect(
      violations(`export function make() {\n  return z.array(inner);\n}`),
    ).toEqual([]);
    expect(
      violations(`if (!z.validate(slugParamSchema, slug)) return null;`),
    ).toEqual([]);
    // register する factory 経路（共有してはいけない側）は対象外
    expect(
      violations(`return createSpanArraySchema().register(fieldRegistry, {});`),
    ).toEqual([]);
  });

  test("src に構築と parse を同じ式で書いた箇所が無い", () => {
    const files = collectSourceFiles(SRC);
    // 走査が 0 件に落ちると「違反ゼロ」と区別が付かない。
    expect(files.length).toBeGreaterThan(100);

    let parseCount = 0;
    const hits: string[] = [];
    for (const fp of files) {
      // コメントを剥がしてから見る。剥がさないと「以前はこう書いていた」と
      // 説明した JSDoc の散文（`z.boolean()` … `.parse("`）に自分で引っかかる。
      const text = stripComments(readFileSync(fp, "utf8"));
      parseCount += [...text.matchAll(ANY_PARSE)].length;
      for (const m of text.matchAll(CONSTRUCT_AND_PARSE)) {
        hits.push(`${fp}: ${m[0].trim()}`);
      }
    }

    // 下限は parse 式の総数。matcher が壊れて 0 件になっても緑にしない。
    expect(parseCount).toBeGreaterThan(200);
    expect(hits).toEqual([]);
  });
});
