/**
 * 型安全方針由来の 3 gate:
 *
 * 0. `Object.values(...)` の結果に `as T[]` を付けない（lint が見られない形）
 * 1. `as unknown as FieldMetadata` cast は src に置かない
   （旧 `typed-input-control.ts` の二重 cast は `useTypedControl` 化で不要になった）
 * 2. `updateTag` / `revalidateTag` に渡す `CACHE_TAGS.*` は `cacheTag` producer を
 *    持たない場合、`INVALIDATION_ONLY` allowlist に明示的に載せる（管理系リストで
 *    意図的に「無効化のみ・キャッシュ producer なし」としているタグ集合の drift 検知）
 *
 * `architecture-boundaries.test.ts` の末尾の describe 群を per-concern に
 * 分離した際にここへ切り出した (元 tree ではまとめて `conform FieldMetadata generic
 * invariance gate` describe に同居していた)。
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { collectSourceFiles } from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");

/** `as unknown as FieldMetadata` の二重 cast を含むか。 */
export function hasFieldMetadataDoubleCast(source: string): boolean {
  return /as\s+unknown\s+as\s+FieldMetadata\b/u.test(source);
}

/**
 * `Object.values(...)` の直後に `as` が続くか。
 *
 * **なぜ gate なのか**: `@typescript-eslint/no-unnecessary-type-assertion` は
 * この形を検出できない。要素型が union の **type alias** になっている配列
 * （`FV[]`）だと、同一型と判定されず「不要」と言ってくれない。実測:
 *
 *   Object.values(F) as ("A" | "B")[]  → 報告される
 *   Object.values(F) as FV[]           → **報告されない**
 *
 * 実際 `prisma-types.ts` に 3 件（`EVENT_FORMAT_VALUES` ほか）が残っていて、
 * lint 緑のまま気付かれなかった。差し戻しても lint は緑のままなので、
 * ルール側では塞げない。
 *
 * **主張が常に真である根拠**: `Object.values` は引数の値型をそのまま要素型に
 * するので、`as const` オブジェクトに対しては既に望む型が付いている（cast は
 * 何も変えない）。`Record<string, unknown>` のような広い型に対しては
 * `unknown[]` になり、そこへの `as T[]` は**検査なしの widening** で、
 * それはそれで許したくない。どちらの場合も付けるべきではない。
 *
 * 直し方: cast ではなく宣言側に型注釈を置く。
 *   const XS: XValue[] = Object.values(X);
 *
 * `Object.keys` は対象外。あちらは仕様上 `string[]` を返すので cast が要る。
 */
export function hasObjectValuesCast(source: string): boolean {
  const start = /\bObject\.values\s*\(/gu;
  for (const match of source.matchAll(start)) {
    let depth = 1;
    let idx = (match.index ?? 0) + match[0].length;
    while (idx < source.length && depth > 0) {
      const c = source[idx];
      if (c === "(") depth += 1;
      else if (c === ")") depth -= 1;
      idx += 1;
    }
    if (depth !== 0) continue;
    // 閉じ括弧の直後、空白（改行含む）を飛ばして `as` が来ていたら cast。
    const rest = source.slice(idx);
    if (/^\s*as\s/u.test(rest)) return true;
  }
  return false;
}

describe("type-safety casts / cache-tag drift", () => {
  test("検出できる形・できない形（fixture）", () => {
    expect(
      hasFieldMetadataDoubleCast("const f = x as unknown as FieldMetadata;"),
    ).toBe(true);
    // 改行を挟んでも同じ cast。
    expect(
      hasFieldMetadataDoubleCast("const f = x as unknown as\n  FieldMetadata;"),
    ).toBe(true);
    // 単発 cast はこの gate の対象外（別 gate が見る）。
    expect(hasFieldMetadataDoubleCast("const f = x as FieldMetadata;")).toBe(
      false,
    );
    // 名前が前方一致するだけの型は拾わない。
    expect(
      hasFieldMetadataDoubleCast(
        "const f = x as unknown as FieldMetadataLike;",
      ),
    ).toBe(false);
  });

  test("`as unknown as FieldMetadata` cast は src に存在しない", () => {
    const glob = new Bun.Glob("**/*.{ts,tsx}");
    const scanned: string[] = [];
    const offenders: string[] = [];
    for (const rel of glob.scanSync({ cwd: SRC_ROOT })) {
      const abs = join(SRC_ROOT, rel);
      scanned.push(abs);
      if (hasFieldMetadataDoubleCast(readFileSync(abs, "utf-8"))) {
        offenders.push(relative(ROOT, abs));
      }
    }
    // 走査が 0 件に落ちると違反ゼロと区別が付かない。
    expect(scanned.length).toBeGreaterThan(100);
    expect(offenders).toEqual([]);
  }, 30000);

  test("updateTag/revalidateTag する CACHE_TAGS は cacheTag producer を持つ（または invalidation-only 許可リスト）", () => {
    // updateTag / revalidateTag に渡す CACHE_TAGS は、いずれかの use cache 関数が cacheTag で
    // 生成していなければ no-op の死んだ無効化になり、「存在しない契約」を匂わせて将来の保守者を
    // 惑わせる。下記は「管理エンティティの一覧が現状あえて未キャッシュ（admin は都度フレッシュ
    // 取得）で、mutation 時の無効化のみ前方互換として置いている」意図的な invalidation-only タグ。
    // この集合を機械的に固定し、(a) 新たな未生成タグの無効化が紛れ込む（producer を足すか本リストに
    // 意図を明記するか二択を強制）/ (b) 既存 invalidation-only にキャッシュを足したのに本リストの
    // 除去を忘れる、の双方向ドリフトを検出する。
    //
    // consumer 判定は 2 系統:
    // 1. 直接呼び: `updateTag(CACHE_TAGS.X)` / `revalidateTag(CACHE_TAGS.X)` — 単一行スキャン
    // 2. SSoT helper: `invalidateSiteWideCache([CACHE_TAGS.X, ...])` /
    //    `invalidateSiteWideCacheFromRouteHandler([...])` — 引数リストが複数行にまたがるので
    //    balanced-paren で丸ごと抽出して CACHE_TAGS.X を拾う。helper 経由の consumer が
    //    line-scanner から漏れていた bug (CACHE-01) の修正。
    const INVALIDATION_ONLY = [
      "BLOCK_TEMPLATES",
      "COUPONS",
      "CUSTOMERS",
      "EVENT_WAITLIST",
      "INQUIRIES",
      "MEDIA",
      "RESERVATIONS",
    ].sort();

    const files = collectSourceFiles(SRC_ROOT);
    const produced = new Set<string>();
    const consumed = new Set<string>();
    const TAG_RE = /CACHE_TAGS\.([A-Z_]+)/gu;
    const SITE_WIDE_START_RE =
      /\b(?:invalidateSiteWideCache|invalidateSiteWideCacheFromRouteHandler)\s*\(/gu;

    for (const file of files) {
      const content = readFileSync(file, "utf8");

      // (2) SSoT helper 呼び出しは引数リストが複数行になる: balanced-paren で丸ごと抽出。
      for (const match of content.matchAll(SITE_WIDE_START_RE)) {
        const startIdx = (match.index ?? 0) + match[0].length;
        let depth = 1;
        let idx = startIdx;
        while (idx < content.length && depth > 0) {
          const c = content[idx];
          if (c === "(") depth += 1;
          else if (c === ")") depth -= 1;
          idx += 1;
        }
        const argBlock = content.slice(startIdx, Math.max(startIdx, idx - 1));
        for (const tagMatch of argBlock.matchAll(TAG_RE)) {
          const tag = tagMatch[1];
          if (tag) consumed.add(tag);
        }
      }

      // (1) 直接呼び + producer は行単位スキャン (既存挙動を維持)。
      const lines = content.split(/\r?\n/u);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
        const isProducer = /\bcacheTag\(/u.test(line);
        const isConsumer = /\b(?:updateTag|revalidateTag)\(/u.test(line);
        if (!isProducer && !isConsumer) continue;
        for (const match of line.matchAll(TAG_RE)) {
          const tag = match[1];
          if (!tag) continue;
          if (isProducer) produced.add(tag);
          if (isConsumer) consumed.add(tag);
        }
      }
    }

    const unproducedConsumed = [...consumed]
      .filter((tag) => !produced.has(tag))
      .sort();

    expect(unproducedConsumed).toEqual(INVALIDATION_ONLY);
  });
});

describe("Object.values の結果に cast を付けない", () => {
  test("検出できる形・できない形（fixture）", () => {
    // 落ちるべき形: 1 行
    expect(hasObjectValuesCast("const v = Object.values(F) as FV[];")).toBe(
      true,
    );
    // 落ちるべき形: 実際に repo にあった改行入りの形
    expect(
      hasObjectValuesCast(
        "export const XS = Object.values(\n  X,\n) as XValue[];",
      ),
    ).toBe(true);
    // 落ちるべき形: 引数の中に括弧があっても閉じ位置を取り違えない
    expect(
      hasObjectValuesCast("const v = Object.values(pick(a, b)) as FV[];"),
    ).toBe(true);

    // 落ちてはいけない形: 宣言側の型注釈（これが直した後の形）
    expect(hasObjectValuesCast("const v: FV[] = Object.values(F);")).toBe(
      false,
    );
    // 落ちてはいけない形: Object.keys は string[] を返すので cast が要る
    expect(hasObjectValuesCast("const k = Object.keys(F) as FV[];")).toBe(
      false,
    );
    // 落ちてはいけない形: 後続がメソッド呼び出し
    expect(hasObjectValuesCast("const v = Object.values(F).map(String);")).toBe(
      false,
    );
    // 落ちてはいけない形: 別の識別子の一部
    expect(hasObjectValuesCast("const v = myObject.valuesOf(F) as FV[];")).toBe(
      false,
    );
  });

  test("`Object.values(...) as ...` は src に存在しない", () => {
    const files = collectSourceFiles(SRC_ROOT);
    // 走査が 0 件に落ちると違反ゼロと区別が付かない。
    expect(files.length).toBeGreaterThan(100);

    const offenders = files
      .filter((file) => hasObjectValuesCast(readFileSync(file, "utf8")))
      .map((file) => relative(ROOT, file).replaceAll("\\", "/"));

    expect(offenders).toEqual([]);
  }, 30000);
});
