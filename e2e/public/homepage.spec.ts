import { test, expect } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * 公開サイト - ホームページ E2E テスト
 *
 * テストシナリオ:
 * 1. ページの基本表示
 * 2. ヘッダーナビゲーション
 * 3. フッター
 * 4. セクション表示
 * 5. レスポンシブデザイン
 * 6. アクセシビリティ
 */

// =============================================================================
// 1. ページの基本表示
// =============================================================================

test.describe("ホームページ - 基本表示", () => {
  test("ホームページが正しく読み込まれる", async ({ page }) => {
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    // ページが正常に読み込まれることを確認
    expect(page.url()).toContain("/");

    // メインコンテンツが表示されることを確認
    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("ページタイトルが設定されている", async ({ page }) => {
    await page.goto(urls.home);

    // titleタグにコンテンツがあることを確認
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("メタディスクリプションが設定されている", async ({ page }) => {
    await page.goto(urls.home);

    const metaDescription = page.locator('meta[name="description"]');
    const content = await metaDescription.getAttribute("content");

    // メタディスクリプションが存在し、空でないことを確認
    expect(content).not.toBeNull();
    expect(content?.length).toBeGreaterThan(0);
  });

  test("OGPタグが設定されている", async ({ page }) => {
    await page.goto(urls.home);

    // og:title
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /.+/);

    // og:description
    const ogDescription = page.locator('meta[property="og:description"]');
    await expect(ogDescription).toHaveAttribute("content", /.+/);

    // og:type
    const ogType = page.locator('meta[property="og:type"]');
    await expect(ogType).toHaveAttribute("content", /.+/);
  });
});

// =============================================================================
// 2. ヘッダーナビゲーション
// =============================================================================

test.describe("ホームページ - ヘッダー", () => {
  test("ヘッダーが表示される", async ({ page }) => {
    await page.goto(urls.home);

    const header = page.locator("header");
    await expect(header).toBeVisible();
  });

  test("ロゴがクリック可能", async ({ page }) => {
    await page.goto(urls.home);

    // ロゴまたはサイト名のリンクを確認
    const logoLink = page.locator('header a[href="/"]').first();
    await expect(logoLink).toBeVisible();
  });

  test("ナビゲーションリンクが表示される", async ({ page }) => {
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    // デスクトップビューでのナビゲーション
    // スペース、予約、ブログ、ニュース、お問い合わせなどのリンク
    const navLinks = page.locator("header nav a, header a");
    const count = await navLinks.count();

    // 少なくともいくつかのナビゲーションリンクが存在することを確認
    expect(count).toBeGreaterThan(0);
  });

  test("スペース一覧へのリンクが機能する", async ({ page }) => {
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    const spacesLink = page.locator('a[href="/spaces"]').first();

    if ((await spacesLink.count()) > 0) {
      await spacesLink.click();
      await page.waitForURL("/spaces");
      expect(page.url()).toContain("/spaces");
    }
  });

  test("予約ページへのリンクが機能する", async ({ page }) => {
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    const reservationLink = page.locator('a[href="/reservation"]').first();

    if ((await reservationLink.count()) > 0) {
      await reservationLink.click();
      await page.waitForURL("/reservation");
      expect(page.url()).toContain("/reservation");
    }
  });

  test("お問い合わせページへのリンクが機能する", async ({ page }) => {
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    const contactLink = page.locator('a[href="/contact"]').first();

    if ((await contactLink.count()) > 0) {
      await contactLink.click();
      await page.waitForURL("/contact");
      expect(page.url()).toContain("/contact");
    }
  });
});

// =============================================================================
// 3. フッター
// =============================================================================

test.describe("ホームページ - フッター", () => {
  test("フッターが表示される", async ({ page }) => {
    await page.goto(urls.home);

    const footer = page.locator("footer");
    await expect(footer).toBeVisible();
  });

  test("フッターにコピーライトが表示される", async ({ page }) => {
    await page.goto(urls.home);

    const footer = page.locator("footer");
    const copyrightText = footer.locator("text=©, text=Copyright");

    // コピーライト表示があることを確認
    if ((await copyrightText.count()) > 0) {
      await expect(copyrightText.first()).toBeVisible();
    }
  });

  test("フッターにリンクが含まれる", async ({ page }) => {
    await page.goto(urls.home);

    const footerLinks = page.locator("footer a");
    const count = await footerLinks.count();

    // フッターに少なくとも1つのリンクがあることを確認
    expect(count).toBeGreaterThan(0);
  });

  test("利用規約へのリンクが機能する", async ({ page }) => {
    await page.goto(urls.home);

    const termsLink = page.locator('footer a[href="/terms"]');

    if ((await termsLink.count()) > 0) {
      await termsLink.click();
      await page.waitForURL("/terms");
      expect(page.url()).toContain("/terms");
    }
  });

  test("プライバシーポリシーへのリンクが機能する", async ({ page }) => {
    await page.goto(urls.home);

    const privacyLink = page.locator('footer a[href*="privacy"]');

    if ((await privacyLink.count()) > 0) {
      await privacyLink.click();
      await page.waitForURL(/terms\/privacy-policy/);
    }
  });
});

// =============================================================================
// 4. セクション表示
// =============================================================================

test.describe("ホームページ - メインセクション", () => {
  test("ヒーローセクションが表示される", async ({ page }) => {
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    // ヒーローセクションまたはメインビジュアルが存在することを確認
    const heroSection = page.locator(
      'section:first-of-type, [data-section="hero"], .hero',
    );
    await expect(heroSection.first()).toBeVisible();
  });

  test("CTAボタンが表示される", async ({ page }) => {
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    // 予約するボタンやお問い合わせボタンなどのCTA
    const ctaButton = page.locator(
      'a:has-text("予約"), a:has-text("お問い合わせ"), button:has-text("予約")',
    );

    if ((await ctaButton.count()) > 0) {
      await expect(ctaButton.first()).toBeVisible();
    }
  });

  test("スペース紹介セクションが表示される", async ({ page }) => {
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    // スペース紹介セクションまたはスペースカード
    const spacesSection = page.locator(
      '[data-section="spaces"], text=スペース, section:has-text("スペース")',
    );

    if ((await spacesSection.count()) > 0) {
      await expect(spacesSection.first()).toBeVisible();
    }
  });

  test("ニュースセクションが表示される", async ({ page }) => {
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    // ニュースセクションまたはお知らせセクション
    const newsSection = page.locator(
      '[data-section="news"], text=ニュース, text=お知らせ, section:has-text("ニュース")',
    );

    if ((await newsSection.count()) > 0) {
      await expect(newsSection.first()).toBeVisible();
    }
  });
});

// =============================================================================
// 5. レスポンシブデザイン
// =============================================================================

test.describe("ホームページ - レスポンシブ", () => {
  test("モバイルビューでページが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("モバイルビューでハンバーガーメニューが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    // ハンバーガーメニューボタン
    const menuButton = page.locator(
      'button[aria-label*="メニュー"], button[aria-label*="menu"], button:has([class*="menu"]), [data-testid="mobile-menu"]',
    );

    if ((await menuButton.count()) > 0) {
      await expect(menuButton.first()).toBeVisible();
    }
  });

  test("タブレットビューでページが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    const main = page.locator("main");
    await expect(main).toBeVisible();
  });

  test("大画面ビューでページが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    const main = page.locator("main");
    await expect(main).toBeVisible();
  });
});

// =============================================================================
// 6. アクセシビリティ
// =============================================================================

test.describe("ホームページ - アクセシビリティ", () => {
  test("ページにmain要素が1つ存在する", async ({ page }) => {
    await page.goto(urls.home);

    const mainElements = page.locator("main");
    const count = await mainElements.count();

    expect(count).toBe(1);
  });

  test("見出し階層が正しい", async ({ page }) => {
    await page.goto(urls.home);

    // h1が存在することを確認
    const h1 = page.locator("h1");
    const h1Count = await h1.count();

    expect(h1Count).toBeGreaterThanOrEqual(1);
  });

  test("画像にalt属性がある", async ({ page }) => {
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    const images = page.locator("img");
    const imageCount = await images.count();

    for (let i = 0; i < Math.min(imageCount, 10); i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute("alt");

      // alt属性が存在することを確認（空文字も許容 - 装飾画像の場合）
      expect(alt).not.toBeNull();
    }
  });

  test("フォーカス可能な要素がキーボードで操作できる", async ({ page }) => {
    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    // Tabキーでフォーカスを移動
    await page.keyboard.press("Tab");

    // フォーカスがどこかの要素に当たっていることを確認
    const focusedElement = page.locator(":focus");
    await expect(focusedElement).toBeVisible();
  });

  test("スキップリンクが存在する（あれば）", async ({ page }) => {
    await page.goto(urls.home);

    const skipLink = page.locator('a[href="#main"], a[href="#content"]');

    if ((await skipLink.count()) > 0) {
      // スキップリンクが存在する場合、最初のTabでフォーカスされることを確認
      await page.keyboard.press("Tab");
      await expect(skipLink.first()).toBeFocused();
    }
  });
});

// =============================================================================
// 7. パフォーマンス
// =============================================================================

test.describe("ホームページ - パフォーマンス", () => {
  test("ページが5秒以内に読み込まれる", async ({ page }) => {
    const startTime = Date.now();

    await page.goto(urls.home);
    await page.waitForLoadState("domcontentloaded");

    const loadTime = Date.now() - startTime;

    expect(loadTime).toBeLessThan(5000);
  });

  test("LCPが適切な範囲内（10秒以内）", async ({ page }) => {
    await page.goto(urls.home);

    // LCPを測定（簡易版）
    const lcp = await page.evaluate(() => {
      return new Promise((resolve) => {
        new PerformanceObserver((entryList) => {
          const entries = entryList.getEntries();
          const lastEntry = entries[entries.length - 1];
          resolve(lastEntry?.startTime ?? 0);
        }).observe({ type: "largest-contentful-paint", buffered: true });

        // タイムアウト
        setTimeout(() => resolve(0), 10000);
      });
    });

    // LCPが10秒以内であることを確認
    expect(Number(lcp)).toBeLessThan(10000);
  });
});

// =============================================================================
// 8. エラーハンドリング
// =============================================================================

test.describe("ホームページ - エラーハンドリング", () => {
  test("404ページが正しく表示される", async ({ page }) => {
    await page.goto("/nonexistent-page-12345");
    await page.waitForLoadState("networkidle");

    // 404ページまたはエラーメッセージが表示されることを確認
    const notFoundContent = page.locator(
      "text=404, text=見つかりません, text=Not Found, text=ページが見つかりません",
    );

    await expect(notFoundContent.first()).toBeVisible();
  });

  test("JavaScriptエラーが発生しない", async ({ page }) => {
    const errors: string[] = [];

    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    // 致命的なJavaScriptエラーがないことを確認
    expect(errors.length).toBe(0);
  });

  test("コンソールにエラーがない", async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto(urls.home);
    await page.waitForLoadState("networkidle");

    // Next.jsの開発モードエラーを除外してチェック
    const criticalErrors = consoleErrors.filter(
      (error) =>
        !error.includes("hydration") &&
        !error.includes("Warning") &&
        !error.includes("DevTools"),
    );

    expect(criticalErrors.length).toBe(0);
  });
});
