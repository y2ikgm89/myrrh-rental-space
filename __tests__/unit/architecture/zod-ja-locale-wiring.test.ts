/**
 * Zod 日本語ロケールの配線を固定する。
 *
 * ## なぜ
 *
 * conform は空欄を `undefined` に畳む。フィールド別 `error` は `.min(1)` 等に
 * しか付かないため、未入力は Zod 既定の英語 `invalid_type` がフォームに出る
 * （#1835）。対策は `z.config(z.locales.ja())` を server / client の両バンドル
 * で一度だけ評価すること。配線が外れると英語メッセージが再発する。
 *
 * ## 何を見るか
 *
 * - 両 root layout が `<ZodJaRegistrar />` を描画していること
 * - `src/instrumentation.ts` が `@/shared/lib/validations/zod-ja` を
 *   top-level import していること
 *
 * ## 直し方
 *
 * 落ちたら描画または import が消えている。ロケール設定をやめるなら、この gate
 * と `ZodJaRegistrar` / `zod-ja.ts` をセットで削除する。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const ROOT_LAYOUTS = [
  "src/app/(admin)/layout.tsx",
  "src/app/(public)/layout.tsx",
] as const;

const INSTRUMENTATION = "src/instrumentation.ts";

function read(rel: string): string {
  return readFileSync(join(process.cwd(), ...rel.split("/")), "utf8");
}

function hasZodJaRegistrar(source: string): boolean {
  return /<ZodJaRegistrar\s*\/>/u.test(source);
}

function hasZodJaImport(source: string): boolean {
  return /import\s+"@\/shared\/lib\/validations\/zod-ja"/u.test(source);
}

describe("zod ja locale wiring", () => {
  test("both root layouts render ZodJaRegistrar", () => {
    for (const rel of ROOT_LAYOUTS) {
      expect(hasZodJaRegistrar(read(rel)), rel).toBe(true);
    }
  });

  test("instrumentation imports zod-ja at top level", () => {
    expect(hasZodJaImport(read(INSTRUMENTATION))).toBe(true);
  });

  test("fixture: 描画も import も無いソースは落ちる", () => {
    const bare = "export default function Layout() { return <html /> }";
    expect(hasZodJaRegistrar(bare)).toBe(false);
    expect(hasZodJaImport(bare)).toBe(false);
  });

  test("fixture: 正規の描画と side-effect import は通る", () => {
    expect(hasZodJaRegistrar("<ZodJaRegistrar />")).toBe(true);
    expect(hasZodJaImport('import "@/shared/lib/validations/zod-ja";')).toBe(
      true,
    );
  });
});
