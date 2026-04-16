import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import type { Result } from "axe-core";
import { urls } from "../fixtures";

/**
 * 公開ページ - axe-core 自動アクセシビリティスキャン
 *
 * WCAG 2.1 AA 準拠を自動検証する。
 *
 * 【設計原則】
 * - `AxeBuilder` + `withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])`
 *   で WCAG 2.1 Level AA 相当を検査
 * - `critical` と `serious` 違反のみを厳格チェック（minor/moderate は
 *   `best-practice` 扱いで warning のみ、テスト失敗にはしない）
 * - 動的コンテンツ・サードパーティ iframe（Google Maps, Instagram embed
 *   等）は除外（我々の責任範囲外）
 *
 * 参照:
 * - https://github.com/dequelabs/axe-core/blob/develop/doc/API.md
 * - WCAG 2.1 AA: https://www.w3.org/TR/WCAG21/
 */

// critical/serious 違反のみを許容ゼロとする（axe-core の impact は optional string）
const BLOCKING_IMPACTS = new Set(["serious", "critical"]);

function isBlocking(violation: Result): boolean {
  return violation.impact ? BLOCKING_IMPACTS.has(violation.impact) : false;
}

/**
 * 公開ページ用の AxeBuilder 共通設定
 * - WCAG 2.1 Level A/AA タグで filter
 * - サードパーティ iframe / 外部 embed を exclude
 */
function buildAxeScanner(page: Page): AxeBuilder {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude('iframe[src*="google.com/maps"]')
    .exclude('iframe[src*="youtube.com"]')
    .exclude('iframe[src*="instagram.com"]')
    .exclude('[class*="google-maps" i]');
}

/**
 * 違反を人間可読な文字列に整形（assertion message 用）
 */
function formatAxeViolations(violations: readonly Result[]): string {
  return violations
    .map(
      (v) =>
        `[${v.impact ?? "unknown"}] ${v.id}: ${v.help} (${v.nodes.length} node(s))\n  ${v.helpUrl}\n  ${v.nodes.map((n) => n.target.join(" > ")).join(", ")}`,
    )
    .join("\n\n");
}

test.describe("a11y scan - 公開ページ主要ルート", () => {
  test("ホームページに critical/serious 違反がない", async ({ page }) => {
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(800); // GSAP 入場アニメ完了待ち

    const results = await buildAxeScanner(page).analyze();
    const blocking = results.violations.filter(isBlocking);

    expect(
      blocking,
      `Homepage a11y violations:\n${formatAxeViolations(results.violations)}`,
    ).toEqual([]);
  });

  test("スペース一覧ページに critical/serious 違反がない", async ({ page }) => {
    await page.goto(urls.spaces);
    await page.waitForLoadState("networkidle");

    const results = await buildAxeScanner(page).analyze();
    const blocking = results.violations.filter(isBlocking);

    expect(
      blocking,
      `Spaces list a11y violations:\n${formatAxeViolations(results.violations)}`,
    ).toEqual([]);
  });

  test("予約ページに critical/serious 違反がない", async ({ page }) => {
    await page.goto(urls.reservation);
    await page.waitForLoadState("networkidle");

    const results = await buildAxeScanner(page).analyze();
    const blocking = results.violations.filter(isBlocking);

    expect(
      blocking,
      `Reservation page a11y violations:\n${formatAxeViolations(results.violations)}`,
    ).toEqual([]);
  });

  test("ブログ一覧ページに critical/serious 違反がない", async ({ page }) => {
    await page.goto(urls.posts);
    await page.waitForLoadState("networkidle");

    const results = await buildAxeScanner(page).analyze();
    const blocking = results.violations.filter(isBlocking);

    expect(
      blocking,
      `Posts a11y violations:\n${formatAxeViolations(results.violations)}`,
    ).toEqual([]);
  });

  test("お知らせ一覧ページに critical/serious 違反がない", async ({ page }) => {
    await page.goto(urls.news);
    await page.waitForLoadState("networkidle");

    const results = await buildAxeScanner(page).analyze();
    const blocking = results.violations.filter(isBlocking);

    expect(
      blocking,
      `News a11y violations:\n${formatAxeViolations(results.violations)}`,
    ).toEqual([]);
  });

  test("お問い合わせページに critical/serious 違反がない", async ({ page }) => {
    await page.goto(urls.contact);
    await page.waitForLoadState("networkidle");

    const results = await buildAxeScanner(page).analyze();
    const blocking = results.violations.filter(isBlocking);

    expect(
      blocking,
      `Contact page a11y violations:\n${formatAxeViolations(results.violations)}`,
    ).toEqual([]);
  });

  test("FAQ ページに critical/serious 違反がない", async ({ page }) => {
    await page.goto(urls.faq);
    await page.waitForLoadState("networkidle");

    const results = await buildAxeScanner(page).analyze();
    const blocking = results.violations.filter(isBlocking);

    expect(
      blocking,
      `FAQ a11y violations:\n${formatAxeViolations(results.violations)}`,
    ).toEqual([]);
  });

  test("イベント一覧ページに critical/serious 違反がない", async ({ page }) => {
    await page.goto(urls.events);
    await page.waitForLoadState("networkidle");

    const results = await buildAxeScanner(page).analyze();
    const blocking = results.violations.filter(isBlocking);

    expect(
      blocking,
      `Events a11y violations:\n${formatAxeViolations(results.violations)}`,
    ).toEqual([]);
  });

  test("ログインページに critical/serious 違反がない", async ({ page }) => {
    await page.goto(urls.customerLogin);
    await page.waitForLoadState("networkidle");

    const results = await buildAxeScanner(page).analyze();
    const blocking = results.violations.filter(isBlocking);

    expect(
      blocking,
      `Login a11y violations:\n${formatAxeViolations(results.violations)}`,
    ).toEqual([]);
  });
});
