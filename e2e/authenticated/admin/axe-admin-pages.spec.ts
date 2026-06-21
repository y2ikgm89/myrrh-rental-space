import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import type { Result } from "axe-core";

/**
 * 管理画面 - axe-core 自動アクセシビリティスキャン（管理者認証済み state）
 *
 * 管理画面は業務ツールのため公開ページより緩い許容だが、critical 違反は
 * 必ず潰す。serious 違反は "best-practice" として warning 扱い（assertion
 * には含めない）。
 *
 * 【設計原則】
 * - WCAG 2.1 Level A/AA タグで filter
 * - 管理画面特有のウィジェット（Lexical editor / contenteditable 等）
 *   は既知の false positive が多いため除外
 * - `critical` のみを blocking（serious はログ出力）
 *
 * 前提: chromium-admin project で実行（setup-admin が storage state 作成済み）
 */

/**
 * 管理画面用の AxeBuilder 共通設定
 * - Lexical editor は contenteditable false positive があるため exclude
 * - 動的ウィジェット（calendar, recharts 等）も exclude
 */
function buildAdminAxeScanner(page: Page): AxeBuilder {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude('[contenteditable="true"]') // Lexical editor
    .exclude('[class*="recharts" i]') // Recharts SVG
    .exclude('[class*="fc-" i]') // FullCalendar (if any)
    .exclude('[data-testid="lexical-editor"]');
}

/**
 * 違反を人間可読な文字列に整形（assertion message 用）
 */
function formatViolations(violations: readonly Result[]): string {
  return violations
    .map(
      (v) =>
        `[${v.impact ?? "unknown"}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n  ${v.helpUrl}`,
    )
    .join("\n\n");
}

test.describe("a11y scan - 管理画面主要ページ", () => {
  test("ダッシュボードに critical 違反がない", async ({ page }) => {
    await page.goto("/admin");

    const results = await buildAdminAxeScanner(page).analyze();
    const criticals = results.violations.filter((v) => v.impact === "critical");

    expect(
      criticals,
      `Admin dashboard critical a11y violations:\n${formatViolations(criticals)}`,
    ).toEqual([]);
  });

  test("予約管理ページに critical 違反がない", async ({ page }) => {
    await page.goto("/admin/reservations");

    const results = await buildAdminAxeScanner(page).analyze();
    const criticals = results.violations.filter((v) => v.impact === "critical");

    expect(
      criticals,
      `Admin reservations critical a11y violations:\n${formatViolations(criticals)}`,
    ).toEqual([]);
  });

  test("スペース管理ページに critical 違反がない", async ({ page }) => {
    await page.goto("/admin/spaces");

    const results = await buildAdminAxeScanner(page).analyze();
    const criticals = results.violations.filter((v) => v.impact === "critical");

    expect(
      criticals,
      `Admin spaces critical a11y violations:\n${formatViolations(criticals)}`,
    ).toEqual([]);
  });

  test("FAQ 管理ページに critical 違反がない", async ({ page }) => {
    await page.goto("/admin/faq");

    const results = await buildAdminAxeScanner(page).analyze();
    const criticals = results.violations.filter((v) => v.impact === "critical");

    expect(
      criticals,
      `Admin FAQ critical a11y violations:\n${formatViolations(criticals)}`,
    ).toEqual([]);
  });

  test("ブログ新規作成ページに critical 違反がない（Lexical editor 除外）", async ({
    page,
  }) => {
    await page.goto("/admin/blog/new");

    const results = await buildAdminAxeScanner(page).analyze();
    const criticals = results.violations.filter((v) => v.impact === "critical");

    expect(
      criticals,
      `Admin blog new page critical a11y violations:\n${formatViolations(criticals)}`,
    ).toEqual([]);
  });

  test("設定ページに critical 違反がない", async ({ page }) => {
    await page.goto("/admin/settings");

    const results = await buildAdminAxeScanner(page).analyze();
    const criticals = results.violations.filter((v) => v.impact === "critical");

    expect(
      criticals,
      `Admin settings critical a11y violations:\n${formatViolations(criticals)}`,
    ).toEqual([]);
  });
});
