/**
 * `.claude/rules/type-safety.md` 由来の 2 gate:
 *
 * 1. `as unknown as FieldMetadata` cast は `typed-input-control.ts` 内部だけ許可
 * 2. `updateTag` / `revalidateTag` に渡す `CACHE_TAGS.*` は `cacheTag` producer を
 *    持たない場合、`INVALIDATION_ONLY` allowlist に明示的に載せる（管理系リストで
 *    意図的に「無効化のみ・キャッシュ producer なし」としているタグ集合の drift 検知）
 *
 * 2490 行あった `architecture-boundaries.test.ts` の末尾 3 describe を per-concern に
 * 分離した際にここに切り出した (元 tree ではまとめて `conform FieldMetadata generic
 * invariance gate` describe に同居していた)。
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { collectSourceFiles } from "../../helpers/architecture-fs";

const ROOT = process.cwd();
const SRC_ROOT = join(ROOT, "src");

describe("type-safety casts / cache-tag drift", () => {
  test("`as unknown as FieldMetadata` cast は typed-input-control helper 内部のみ許可", () => {
    const glob = new Bun.Glob("**/*.{ts,tsx}");
    const allowedFile = join(
      SRC_ROOT,
      "shared",
      "lib",
      "conform",
      "typed-input-control.ts",
    );
    const pattern = /as\s+unknown\s+as\s+FieldMetadata\b/;
    const offenders: string[] = [];
    for (const rel of glob.scanSync({ cwd: SRC_ROOT })) {
      const abs = join(SRC_ROOT, rel);
      if (abs === allowedFile) continue;
      const content = readFileSync(abs, "utf-8");
      if (pattern.test(content)) {
        offenders.push(relative(ROOT, abs));
      }
    }
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
