/**
 * admin dashboard a11y の SSoT drift-gate。
 *
 * # 対象
 *
 * - DashboardMain の `<main>` は `id="main-content"` と `tabIndex={-1}` を持つ
 *   (SkipToMainContentLink のジャンプ先 = WCAG 2.4.1 bypass-blocks)
 * - SkipToMainContentLink コンポーネントが (admin)/(dashboard)/layout.tsx から
 *   render される
 * - ResponsiveSidebar の Link に `aria-current` が付与される
 * - SortableTableHead は TableHead 側に `aria-sort` を付ける (button ではない)
 * - MediaItem は `aria-pressed={isSelected}` を持つ (toggle button semantics)
 *
 * 動的レンダリング検証ではなく静的 source scan で強制する。future regression
 * (aria-current を Link から誤って外す等) は bun test で fail する。
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dir, "..", "..", "..");

function read(rel: string): string {
  const abs = resolve(REPO_ROOT, rel);
  expect(existsSync(abs)).toBe(true);
  return readFileSync(abs, "utf8");
}

describe("admin dashboard a11y anchors", () => {
  test("DashboardMain <main> has id=main-content + tabIndex=-1 for skip-link target", () => {
    const src = read(
      "src/app/(admin)/admin/(dashboard)/_components/DashboardMain.tsx",
    );
    expect(src).toMatch(
      /<main[\s\S]*?id="main-content"[\s\S]*?tabIndex=\{-1\}/,
    );
  });

  test("SkipToMainContentLink is rendered from (dashboard)/layout.tsx", () => {
    const src = read("src/app/(admin)/admin/(dashboard)/layout.tsx");
    expect(src).toMatch(/SkipToMainContentLink/);
    expect(src).toMatch(/<SkipToMainContentLink\s*\/>/);
  });

  test("SkipToMainContentLink anchor href matches DashboardMain id", () => {
    const src = read(
      "src/app/(admin)/admin/(dashboard)/_components/SkipToMainContentLink.tsx",
    );
    expect(src).toMatch(/href="#main-content"/);
  });

  test("ResponsiveSidebar Link declares aria-current based on isActive", () => {
    const src = read(
      "src/app/(admin)/admin/(dashboard)/_components/ResponsiveSidebar.tsx",
    );
    expect(src).toMatch(/aria-current=\{isActive \? "page" : undefined\}/);
  });

  test("SortableTableHead attaches aria-sort to TableHead (not button)", () => {
    const src = read(
      "src/app/(admin)/admin/(dashboard)/_shared/components/SortableTableHead.tsx",
    );
    expect(src).toMatch(/<TableHead[^>]*aria-sort=\{ariaSort\}/);
    // ariaSort must be one of the three canonical values
    expect(src).toMatch(/"ascending" \| "descending" \| "none"/);
  });

  test("MediaItem exposes selection state via aria-pressed", () => {
    const src = read(
      "src/app/(admin)/admin/(dashboard)/_shared/components/media-picker/components/MediaItem.tsx",
    );
    // count occurrences: grid + list variant → both toggle buttons
    const matches = src.match(/aria-pressed=\{isSelected\}/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test("MediaPickerDialog tab strip uses role=tablist + tabpanel wiring", () => {
    const src = read(
      "src/app/(admin)/admin/(dashboard)/_shared/components/media-picker/MediaPickerDialog.tsx",
    );
    expect(src).toMatch(/role="tablist"/);
    expect(src).toMatch(/role="tabpanel"/);
    expect(src).toMatch(/aria-controls=\{controlsId\}/);
    expect(src).toMatch(/aria-labelledby="media-picker-tab-/);
  });

  test("LibraryTab filter is a toggle group (aria-pressed), not incomplete tab pattern", () => {
    const src = read(
      "src/app/(admin)/admin/(dashboard)/_shared/components/media-picker/tabs/LibraryTab.tsx",
    );
    expect(src).toMatch(/role="group"/);
    expect(src).toMatch(/aria-pressed=\{isActive\}/);
    // fixed: previously used role="tab" without aria-controls / tabpanel / arrow-key nav
    expect(src).not.toMatch(/role="tab"\s*aria-selected/);
  });
});
