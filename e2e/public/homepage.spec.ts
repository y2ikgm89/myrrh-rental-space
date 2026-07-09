import { test, expect, type Locator, type Page } from "@playwright/test";
import { urls } from "../fixtures";

const NAVIGATION_TIMEOUT_MS = 45_000;
const appSurface = process.env["APP_SURFACE"] ?? "admin";

test.skip(
  appSurface !== "public",
  "Public homepage root is served only on public surface.",
);

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
 * 規約 SSoT: `.claude/rules/testing-e2e.md`
 */

// =============================================================================
// 1. ページ基本表示 + メタ
// =============================================================================

test.describe("ホームページ - 基本表示", () => {
  test("メインコンテンツが表示される", async ({ page }) => {
    await page.goto(urls.home);
    await expect(page.getByRole("main")).toBeVisible();
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
    await expect(page.getByRole("banner")).toBeVisible();
  });

  test("ロゴリンクが home を指す", async ({ page }) => {
    await page.goto(urls.home);
    const logoLink = page
      .getByRole("banner")
      .getByRole("link", { name: /ホームへ戻る/u });
    await expect(logoLink).toHaveAttribute("href", "/");
    await expect(logoLink).toBeVisible();
  });

  test("フッターが表示される", async ({ page }) => {
    await page.goto(urls.home);
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });
});

// =============================================================================
// 3. 主要ナビゲーション（決定論的: seed が常にこれらを描画する契約）
// =============================================================================

test.describe("ホームページ - 主要ナビゲーション", () => {
  test.describe.configure({ timeout: NAVIGATION_TIMEOUT_MS + 15_000 });

  function mainNavigationLink(page: Page, name: string) {
    return page
      .getByRole("navigation", { name: "メインナビゲーション" })
      .getByRole("link", { name });
  }

  async function expectLinkTargetRenders(
    page: Page,
    link: Locator,
    href: string,
  ) {
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", href);

    await page.goto(href);
    await expect(page).toHaveURL(new RegExp(`${href}(?:$|[?#])`, "u"), {
      timeout: NAVIGATION_TIMEOUT_MS,
    });
    await expect(page.getByRole("main")).toBeVisible();
  }

  test("スペース一覧リンクの宛先が描画される", async ({ page }) => {
    await page.goto(urls.home);
    const spacesLink = mainNavigationLink(page, "スペース");
    await expectLinkTargetRenders(page, spacesLink, "/spaces");
  });

  test("予約リンクの宛先が描画される", async ({ page }) => {
    await page.goto(urls.home);
    const reserveLink = page
      .getByRole("banner")
      .getByRole("link", { name: "Reserve", exact: true });
    await expectLinkTargetRenders(page, reserveLink, "/reservation");
  });

  test("お問い合わせリンクの宛先が描画される", async ({ page }) => {
    await page.goto(urls.home);
    const contactLink = mainNavigationLink(page, "お問い合わせ");
    await expectLinkTargetRenders(page, contactLink, "/contact");
  });
});

// =============================================================================
// 4. レスポンシブ（viewport 切替で描画が壊れないこと）
// =============================================================================

test.describe("ホームページ - レスポンシブ", () => {
  test("モバイル viewport で描画される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(urls.home);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("タブレット viewport で描画される", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(urls.home);
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("デスクトップ viewport で描画される", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(urls.home);
    await expect(page.getByRole("main")).toBeVisible();
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
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
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
  test("存在しないパスは not-found UI を表示する", async ({ page }) => {
    await page.goto("/nonexistent-page-12345");

    await expect(
      page.getByRole("heading", { name: "ページが見つかりません", level: 1 }),
    ).toBeVisible();
  });
});
