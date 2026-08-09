/**
 * ESLint custom rule `local/no-raw-updatetag-for-cdn-mapped-cache-tag` の
 * 3 段 drift-gate。
 *
 * 1. Rule behavior: `Linter.verify` で合成コード片に対してルールが期待通り
 *    fire / skip することを確認する。
 * 2. Mapped-keys sync: `CDN_MAPPED_CACHE_TAGS_KEYS` (rule option) が SSoT の
 *    `NEXTJS_TAG_TO_CDN_TAG` (src/shared/lib/constants/cdn-cache-tags.ts) の
 *    identifier キーと完全一致することを確認する。SSoT に mapping を追加して
 *    ESLint 設定を更新し忘れると本テストで落ちる。
 * 3. Legacy allow-list stability: `LEGACY_RAW_UPDATETAG_FILES` の全パスが
 *    disk 上に存在することを確認する。migrate → 削除の際にファイルが実際に
 *    移動された場合、stale なパスを list に残さないよう検出する。
 *
 * Rule 実装本体: `eslint-rules/no-raw-updatetag-for-cdn-mapped-cache-tag.mjs`
 * SSoT: `src/shared/lib/constants/cdn-cache-tags.ts` NEXTJS_TAG_TO_CDN_TAG
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Linter } from "eslint";

// eslint-rules/*.mjs は raw ESM で公開されている (bun test は .mjs を素で解決)
import rule from "../../../eslint-rules/no-raw-updatetag-for-cdn-mapped-cache-tag.mjs";
import {
  CDN_MAPPED_CACHE_TAGS_KEYS,
  LEGACY_RAW_UPDATETAG_FILES,
} from "../../../eslint-rules/cdn-mapped-cache-tag-drift-gate-config.mjs";

const ROOT = process.cwd();
const RULE_NAME = "local/no-raw-updatetag-for-cdn-mapped-cache-tag";

// Linter#verify に渡す flat config。plugin 名 "local" 配下に rule を登録し、
// mappedKeys にフル SSoT リストを渡した状態でルール検証する。
// espree (default parser) で足りる範囲でテストするため、コード片は素の ESM。
function buildLintConfig(
  overrideMappedKeys?: readonly string[],
): Linter.Config {
  return {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
    },
    plugins: {
      // Linter は plugin 定義に rules しか見ないので meta は不要。
      local: { rules: { "no-raw-updatetag-for-cdn-mapped-cache-tag": rule } },
    },
    rules: {
      [RULE_NAME]: [
        "error",
        { mappedKeys: overrideMappedKeys ?? CDN_MAPPED_CACHE_TAGS_KEYS },
      ],
    },
  };
}

function lint(code: string, overrideMappedKeys?: readonly string[]) {
  const linter = new Linter();
  return linter.verify(code, buildLintConfig(overrideMappedKeys), {
    filename: "synthetic.js",
  });
}

describe("eslint local/no-raw-updatetag-for-cdn-mapped-cache-tag", () => {
  describe("rule behavior", () => {
    test("fires on raw updateTag(CACHE_TAGS.<mapped>)", () => {
      const messages = lint(
        `import { updateTag } from "next/cache";
         import { CACHE_TAGS } from "@/shared/lib/constants";
         updateTag(CACHE_TAGS.EVENTS);`,
      );
      expect(messages).toHaveLength(1);
      expect(messages[0]?.ruleId).toBe(RULE_NAME);
      expect(messages[0]?.messageId).toBe("cdnMappedRaw");
      expect(messages[0]?.message).toContain("EVENTS");
      expect(messages[0]?.message).toContain("updateTag");
    });

    test("fires on raw revalidateTag(CACHE_TAGS.<mapped>)", () => {
      const messages = lint(
        `import { revalidateTag } from "next/cache";
         import { CACHE_TAGS } from "@/shared/lib/constants";
         revalidateTag(CACHE_TAGS.SPACES);`,
      );
      expect(messages).toHaveLength(1);
      expect(messages[0]?.messageId).toBe("cdnMappedRaw");
      expect(messages[0]?.message).toContain("SPACES");
    });

    test("fires on FAQ (another CDN-mapped tag)", () => {
      const messages = lint(
        `import { updateTag } from "next/cache";
         import { CACHE_TAGS } from "@/shared/lib/constants";
         updateTag(CACHE_TAGS.FAQ);`,
      );
      expect(messages).toHaveLength(1);
      expect(messages[0]?.message).toContain("FAQ");
    });

    test("does NOT fire on admin-only unmapped tag (COUPONS)", () => {
      const messages = lint(
        `import { updateTag } from "next/cache";
         import { CACHE_TAGS } from "@/shared/lib/constants";
         updateTag(CACHE_TAGS.COUPONS);`,
      );
      expect(messages).toEqual([]);
    });

    test("does NOT fire on other admin-only unmapped tags", () => {
      for (const key of [
        "CUSTOMERS",
        "RESERVATIONS",
        "INQUIRIES",
        "MEDIA",
        "BLOCK_TEMPLATES",
        "REVIEWS",
        "NOTIFICATION_SETTINGS",
        "AUDIT_LOGS",
        "SUPPRESSED_EMAILS",
      ]) {
        const messages = lint(
          `import { updateTag } from "next/cache";
           import { CACHE_TAGS } from "@/shared/lib/constants";
           updateTag(CACHE_TAGS.${key});`,
        );
        expect(messages).toEqual([]);
      }
    });

    test("does NOT fire on invalidateSiteWideCache with mapped tag", () => {
      const messages = lint(
        `import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
         import { CACHE_TAGS } from "@/shared/lib/constants";
         invalidateSiteWideCache([CACHE_TAGS.EVENTS, CACHE_TAGS.SPACES]);`,
      );
      expect(messages).toEqual([]);
    });

    test("does NOT fire on invalidateSiteWideCacheFromRouteHandler with mapped tag", () => {
      const messages = lint(
        `import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache/site-wide";
         import { CACHE_TAGS } from "@/shared/lib/constants";
         invalidateSiteWideCacheFromRouteHandler([CACHE_TAGS.FAQ]);`,
      );
      expect(messages).toEqual([]);
    });

    test("does NOT fire on updateTag(getCacheTag.X.detail(...)) (id-keyed sub-tag)", () => {
      const messages = lint(
        `import { updateTag } from "next/cache";
         import { getCacheTag } from "@/shared/lib/constants";
         updateTag(getCacheTag.spaces.detail("abc"));`,
      );
      expect(messages).toEqual([]);
    });

    test("does NOT fire on updateTag with a bare variable (dynamic tag)", () => {
      const messages = lint(
        `import { updateTag } from "next/cache";
         function purge(tag) { updateTag(tag); }
         purge("dynamic");`,
      );
      expect(messages).toEqual([]);
    });

    test("does NOT fire on updateTag(CACHE_TAGS[dynamicKey]) (computed access)", () => {
      const messages = lint(
        `import { updateTag } from "next/cache";
         import { CACHE_TAGS } from "@/shared/lib/constants";
         function purge(k) { updateTag(CACHE_TAGS[k]); }
         purge("EVENTS");`,
      );
      expect(messages).toEqual([]);
    });

    test("fires on multiple violations in the same file", () => {
      const messages = lint(
        `import { updateTag } from "next/cache";
         import { CACHE_TAGS } from "@/shared/lib/constants";
         updateTag(CACHE_TAGS.EVENTS);
         updateTag(CACHE_TAGS.SPACES);
         updateTag(CACHE_TAGS.COUPONS); // ok — unmapped
         updateTag(CACHE_TAGS.FAQ);`,
      );
      expect(messages).toHaveLength(3);
      const keys = messages
        .map((m) => m.message.match(/CACHE_TAGS\.([A-Z_]+)/)?.[1])
        .filter((k): k is string => Boolean(k));
      expect(keys).toEqual(["EVENTS", "SPACES", "FAQ"]);
    });
  });

  describe("mapped-keys sync with NEXTJS_TAG_TO_CDN_TAG", () => {
    test("CDN_MAPPED_CACHE_TAGS_KEYS === NEXTJS_TAG_TO_CDN_TAG identifier keys", () => {
      const src = readFileSync(
        join(ROOT, "src", "shared", "lib", "constants", "cdn-cache-tags.ts"),
        "utf8",
      );
      // NEXTJS_TAG_TO_CDN_TAG ブロック内から `[CACHE_TAGS.KEY]: ...` を抽出。
      const blockStart = src.indexOf("export const NEXTJS_TAG_TO_CDN_TAG");
      expect(blockStart).toBeGreaterThan(-1);
      // 次の `} as const satisfies` を末端とする (単純な文字列マッチで十分)。
      const blockEnd = src.indexOf(
        "} as const satisfies Record<string, CdnTagValue>",
        blockStart,
      );
      expect(blockEnd).toBeGreaterThan(blockStart);
      const block = src.slice(blockStart, blockEnd);

      const keys = new Set<string>();
      const keyRe = /\[CACHE_TAGS\.([A-Z_]+)\]\s*:/gu;
      for (const m of block.matchAll(keyRe)) {
        if (m[1]) keys.add(m[1]);
      }

      const expected = [...keys].sort();
      const actual = [...CDN_MAPPED_CACHE_TAGS_KEYS].sort();

      expect(actual).toEqual(expected);
    });
  });

  describe("legacy allow-list stability", () => {
    test("all LEGACY_RAW_UPDATETAG_FILES paths still exist", () => {
      const missing: string[] = [];
      for (const rel of LEGACY_RAW_UPDATETAG_FILES) {
        if (!existsSync(join(ROOT, rel))) missing.push(rel);
      }
      expect(missing).toEqual([]);
    });

    test("legacy files really do contain a CDN-mapped raw updateTag / revalidateTag call", () => {
      // 「migration 済 (もう違反していない) なのに list から削除し忘れた」ケースを検出。
      // list を蒸留し続ける sink であることを保証する drift-gate。
      const stale: string[] = [];
      for (const rel of LEGACY_RAW_UPDATETAG_FILES) {
        const abs = join(ROOT, rel);
        if (!existsSync(abs)) continue;
        const content = readFileSync(abs, "utf8");
        // 各 mapped key について raw updateTag/revalidateTag(CACHE_TAGS.KEY) が
        // 少なくとも 1 箇所残っていることを要求する。
        let hasViolation = false;
        for (const key of CDN_MAPPED_CACHE_TAGS_KEYS) {
          const re = new RegExp(
            `\\b(?:updateTag|revalidateTag)\\(\\s*CACHE_TAGS\\.${key}\\b`,
            "u",
          );
          if (re.test(content)) {
            hasViolation = true;
            break;
          }
        }
        if (!hasViolation) stale.push(rel);
      }
      expect(stale).toEqual([]);
    });
  });
});
