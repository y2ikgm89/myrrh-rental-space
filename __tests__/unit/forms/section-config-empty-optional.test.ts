/**
 * 回帰テスト: 全セクション configSchema の「空欄/デフォルト保存」（conform 整合）
 *
 * ページビルダーのセクション編集（AutoSectionForm）は `definition.configSchema` を
 * `parseWithZod`（@conform-to/zod/v4）に通す。conform は空入力/未送信フィールドを
 * `undefined` に変換するため、任意フィールドが `.default()` / `.optional()` を欠くと
 * 「空のまま保存」が `expected string, received undefined` 等で弾かれる
 * （announcement-bar の barFormSchema と同型のバグ）。
 *
 * 全セクションのフィールドは `field-registry.ts` の `field.*` ヘルパー経由で
 * 構築され、すべて `.default()` を持つ（field defaults 契約）。本テストは全 22
 * 定義を registry から列挙し、空 FormData（page-hero は discriminator `variant`
 * のみ指定）で parseWithZod に通して status==="success" を固定する。
 * いずれかのセクションが任意フィールドのガードを失うと本テストが落ちる。
 */
import { describe, test, expect } from "bun:test";
import { parseWithZod } from "@conform-to/zod/v4";
import {
  getAllSectionDefinitions,
  type SectionTypeKey,
} from "@/shared/lib/sections/registry";

function form(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.set(key, value);
  return fd;
}

// page-hero は discriminated union（variant 必須）。各 variant を個別に固定する。
const PAGE_HERO_VARIANTS = [
  "editorial-split",
  "compact",
  "minimal",
  "media",
] as const;
const PAGE_HERO_TYPE: SectionTypeKey = "page-hero";

const definitions = getAllSectionDefinitions();

describe("section configSchema: 空欄/デフォルト保存（conform 整合）", () => {
  for (const def of definitions) {
    if (def.type === PAGE_HERO_TYPE) continue;
    test(`${def.type}: 全フィールド空でも保存できる`, () => {
      const submission = parseWithZod(new FormData(), {
        schema: def.configSchema,
      });
      if (submission.status !== "success") {
        // 失敗時はどのフィールドが弾かれたか可視化する
        console.log(
          `${def.type} errors:`,
          JSON.stringify(submission.reply().error),
        );
      }
      expect(submission.status).toBe("success");
    });
  }

  for (const variant of PAGE_HERO_VARIANTS) {
    test(`page-hero(${variant}): variant 指定のみで保存できる`, () => {
      const def = definitions.find((d) => d.type === "page-hero");
      if (!def) throw new Error("page-hero definition missing");
      const submission = parseWithZod(form({ variant }), {
        schema: def.configSchema,
      });
      if (submission.status !== "success") {
        console.log(
          `page-hero(${variant}) errors:`,
          JSON.stringify(submission.reply().error),
        );
      }
      expect(submission.status).toBe("success");
    });
  }
});
