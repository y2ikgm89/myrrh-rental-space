/**
 * Fixed-route system page ↔ requireSystemPagePublished drift gate
 *
 * `src/app/(public)` 配下の固定ルート system page（about/faq/contact/access/
 * events/news/blog/spaces/reservation）は冒頭で
 * `await requireSystemPagePublished("<slug>")` を呼ぶ契約になっている。
 * これを怠ると「非公開にする」トグルがそのページに対して機能せず、
 * 200 OK・indexable のまま DEFAULT_PAGE_SECTIONS で表示され続ける
 * （home は PageActions.tsx 側で非公開トグル自体が非表示のため対象外）。
 *
 * ESLint も型チェックも検出できないため grep gate で守る
 * (`__tests__/unit/lib/features/public-route-gates.test.ts` と同型)。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test, expect } from "bun:test";

const EXPECTED_GATES: ReadonlyArray<{
  readonly file: string;
  readonly slug: string;
}> = [
  { file: "src/app/(public)/about/page.tsx", slug: "about" },
  { file: "src/app/(public)/faq/page.tsx", slug: "faq" },
  { file: "src/app/(public)/contact/page.tsx", slug: "contact" },
  { file: "src/app/(public)/access/page.tsx", slug: "access" },
  { file: "src/app/(public)/events/page.tsx", slug: "events" },
  { file: "src/app/(public)/news/page.tsx", slug: "news" },
  { file: "src/app/(public)/blog/page.tsx", slug: "blog" },
  { file: "src/app/(public)/spaces/page.tsx", slug: "spaces" },
  { file: "src/app/(public)/reservation/page.tsx", slug: "reservation" },
] as const;

const PUBLISHED_GATE_PATTERN =
  /requireSystemPagePublished\(\s*["']([^"']+)["']\s*\)/g;

describe("fixed-route system page ↔ requireSystemPagePublished drift gate", () => {
  for (const entry of EXPECTED_GATES) {
    test(`${entry.file} は requireSystemPagePublished("${entry.slug}") を呼ぶ`, () => {
      const abs = join(process.cwd(), entry.file);
      const source = readFileSync(abs, "utf-8");
      const matches = [...source.matchAll(PUBLISHED_GATE_PATTERN)];
      const slugs = matches
        .map((m) => m[1])
        .filter((s): s is string => Boolean(s));
      expect(slugs).toContain(entry.slug);
    });
  }

  test("EXPECTED_GATES に重複エントリがない", () => {
    const files = EXPECTED_GATES.map((e) => e.file);
    expect(new Set(files).size).toBe(files.length);
  });

  test("home page.tsx は requireSystemPagePublished を呼ばない（非公開トグル自体が非表示のため対象外・仕様の明示）", () => {
    const abs = join(process.cwd(), "src/app/(public)/page.tsx");
    const source = readFileSync(abs, "utf-8");
    expect(source).not.toMatch(/requireSystemPagePublished/);
  });
});
