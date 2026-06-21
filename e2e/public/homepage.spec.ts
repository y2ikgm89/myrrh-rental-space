import { test, expect } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * 公開サイト - ホームページ E2E
 *
 * 責務: 「描画が機能している」「主要な公開リンクが正しく遷移する」「a11y 基礎契約を守る」
 * の 3 点のみ。
 *
 * 責務分離（再 litigate 禁止）:
 * - 到達性のみの最小 gate → `e2e/smoke/homepage.smoke.spec.ts`
 * - パフォーマンス（LCP / TTFB / TBT）→ Lighthouse CI
 * - axe 違反 → `e2e/a11y/axe-public-pages.spec.ts`
 * - ビジュアル → `e2e/visual/public-pages.spec.ts`
 *
 * 規約 SSoT: `.claude/rules/test-quality/e2e.md`
 */

// =============================================================================
// 1. ページ基本表示 + メタ
// =============================================================================

test.describe("ホームページ - 基本表示", () => {
  test("メインコンテンツが表示される", async ({ page }) => {
    await page.goto(urls.home);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("ページタイトルとメタディスクリプションが設定されている", async ({
    page,
  }) => {
    await page.goto(urls.home);

    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);

    const description = await page
      .locator('meta[name="description"]')
      .getAttribute("content");
    expect(description).not.toBeNull();
    expect(description?.length ?? 0).toBeGreaterThan(0);
  });

  test("OGP タグが設定されている", async ({ page }) => {
    await page.goto(urls.home);

    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
      "content",
      /.+/,
    );
    await expect(
      page.locator('meta[property="og:description"]'),
    ).toHaveAttribute("content", /.+/);
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
      "content",
      /.+/,
    );
  });
});

// =============================================================================
// 2. ヘッダー / フッター
// =============================================================================

test.describe("ホームページ - ヘッダー / フッター", () => {
  test("ヘッダーが表示される", async ({ page }) => {
    await page.goto(urls.home);
    await expect(page.locator("header").first()).toBeVisible();
  });

  test("ロゴリンクが home を指す", async ({ page }) => {
    await page.goto(urls.home);
    await expect(page.locator('header a[href="/"]').first()).toBeVisible();
  });

  test("フッターが表示される", async ({ page }) => {
    await page.goto(urls.home);
    await expect(page.locator("footer").first()).toBeVisible();
  });
});

// =============================================================================
// 3. 主要ナビゲーション（決定論的: seed が常にこれらを描画する契約）
// =============================================================================

test.describe("ホームページ - 主要ナビゲーション", () => {
  test("スペース一覧へ遷移できる", async ({ page }) => {
    await page.goto(urls.home);
    await page.locator('a[href="/spaces"]').first().click();
    await expect(page).toHaveURL(/\/spaces/);
  });

  test("予約ページへ遷移できる", async ({ page }) => {
    await page.goto(urls.home);
    await page.locator('a[href="/reservation"]').first().click();
    await expect(page).toHaveURL(/\/reservation/);
  });

  test("お問い合わせページへ遷移できる", async ({ page }) => {
    await page.goto(urls.home);
    await page.locator('a[href="/contact"]').first().click();
    await expect(page).toHaveURL(/\/contact/);
  });
});

// =============================================================================
// 4. レスポンシブ（viewport 切替で描画が壊れないこと）
// =============================================================================

test.describe("ホームページ - レスポンシブ", () => {
  test("モバイル viewport で描画される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(urls.home);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("タブレット viewport で描画される", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(urls.home);
    await expect(page.locator("main").first()).toBeVisible();
  });

  test("デスクトップ viewport で描画される", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(urls.home);
    await expect(page.locator("main").first()).toBeVisible();
  });
});

// =============================================================================
// 5. アクセシビリティ基礎契約（axe 詳細は a11y spec に分離）
// =============================================================================

test.describe("ホームページ - a11y 基礎契約", () => {
  test("main 要素が 1 つだけ存在する", async ({ page }) => {
    await page.goto(urls.home);
    await expect(page.locator("main")).toHaveCount(1);
  });

  test("h1 が少なくとも 1 つ存在する", async ({ page }) => {
    await page.goto(urls.home);
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("Tab キーでフォーカス可能な要素に遷移する", async ({ page }) => {
    await page.goto(urls.home);
    await page.keyboard.press("Tab");
    await expect(page.locator(":focus")).toBeVisible();
  });
});

// =============================================================================
// 6. 404 ハンドリング
// =============================================================================

test.describe("ホームページ - エラーハンドリング", () => {
  test("存在しないパスは 404 を返す", async ({ page }) => {
    const response = await page.goto("/nonexistent-page-12345", {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status()).toBe(404);
  });
});
