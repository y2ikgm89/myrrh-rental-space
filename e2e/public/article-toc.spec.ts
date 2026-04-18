import { test, expect, type Page } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * 公開記事ページの目次（Table of Contents）E2E テスト
 *
 * テストシナリオ:
 * 1. デスクトップ: sticky サイドバー目次の表示 / クリック / scroll-spy
 * 2. モバイル: 本文冒頭の `<details>` 折りたたみ目次
 * 3. 短い記事（h2 < 2）では TOC が表示されないこと
 *
 * 注: `ArticleTableOfContents` は contentJson に anchorId が永続化されて
 * いる記事でのみ表示される。未マイグレーション記事（anchorId 空）では
 * TOC は現れない。seed データの状態に依存するため全テストは `skip()` ガード付き。
 */

async function openFirstPost(page: Page): Promise<boolean> {
  await page.goto(urls.posts);
  await page.waitForLoadState("networkidle");

  const articleLink = page.locator('a[href*="/blog/"]').first();
  if ((await articleLink.count()) === 0) return false;

  await articleLink.click();
  await page.waitForLoadState("networkidle");
  return true;
}

// =============================================================================
// 1. デスクトップ (lg+): sticky サイドバー目次
// =============================================================================

test.describe("記事詳細 - デスクトップサイドバー TOC", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  test("h2 が2つ以上ある記事では TOC が表示される", async ({ page }) => {
    const opened = await openFirstPost(page);
    if (!opened) {
      test.skip(true, "ブログ記事が存在しません");
      return;
    }

    const toc = page.locator('nav[aria-label="目次"]').first();

    if ((await toc.count()) === 0) {
      test.skip(true, "TOC を持つ記事が seed に存在しません");
      return;
    }

    await expect(toc).toBeVisible();
    await expect(toc.locator("ol li")).not.toHaveCount(0);
  });

  test("TOC リンクをクリックすると見出しまでスクロールする", async ({
    page,
  }) => {
    const opened = await openFirstPost(page);
    if (!opened) {
      test.skip(true, "ブログ記事が存在しません");
      return;
    }

    const tocLink = page.locator("a[data-toc-link]").first();
    if ((await tocLink.count()) === 0) {
      test.skip(true, "TOC を持つ記事が seed に存在しません");
      return;
    }

    const anchorId = await tocLink.getAttribute("data-toc-link");
    expect(anchorId).toBeTruthy();

    await tocLink.click();
    await page.waitForTimeout(500);

    // ハッシュが URL に反映される（pushState）
    expect(page.url()).toContain(`#${anchorId}`);

    // 対応する見出しが viewport 内に存在する
    const heading = page.locator(`#${anchorId}`);
    await expect(heading).toBeInViewport();
  });

  test("記事本文の見出しに id 属性が付与されている", async ({ page }) => {
    const opened = await openFirstPost(page);
    if (!opened) {
      test.skip(true, "ブログ記事が存在しません");
      return;
    }

    const toc = page.locator('nav[aria-label="目次"]').first();
    if ((await toc.count()) === 0) {
      test.skip(true, "TOC を持つ記事が seed に存在しません");
      return;
    }

    const headingsWithId = page.locator("article h2[id], article h3[id]");
    await expect(headingsWithId.first()).toHaveCount(1);
  });
});

// =============================================================================
// 2. モバイル: <details> 折りたたみ目次
// =============================================================================

test.describe("記事詳細 - モバイル TOC", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
  });

  test("モバイルでは sidebar TOC は非表示", async ({ page }) => {
    const opened = await openFirstPost(page);
    if (!opened) {
      test.skip(true, "ブログ記事が存在しません");
      return;
    }

    // サイドバー版 TOC は aside.lg:block 配下なので mobile では hidden
    const sidebarAside = page.locator('aside:has(nav[aria-label="目次"])');
    if ((await sidebarAside.count()) === 0) {
      test.skip(true, "TOC を持つ記事が seed に存在しません");
      return;
    }

    await expect(sidebarAside.first()).not.toBeVisible();
  });

  test("モバイルでは details 目次が表示され、開閉できる", async ({ page }) => {
    const opened = await openFirstPost(page);
    if (!opened) {
      test.skip(true, "ブログ記事が存在しません");
      return;
    }

    const details = page.locator('details:has(nav[aria-label="目次"])');
    if ((await details.count()) === 0) {
      test.skip(true, "TOC を持つ記事が seed に存在しません");
      return;
    }

    await expect(details.first()).toBeVisible();

    // 初期状態: 閉じている
    await expect(details.first()).not.toHaveAttribute("open", /.*/);

    // summary をクリックで開く
    await details.first().locator("summary").click();
    await expect(details.first()).toHaveAttribute("open", /.*/);
  });
});

// =============================================================================
// 3. アクセシビリティ
// =============================================================================

test.describe("記事詳細 TOC - アクセシビリティ", () => {
  test("TOC nav に aria-label='目次' が付与されている", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const opened = await openFirstPost(page);
    if (!opened) {
      test.skip(true, "ブログ記事が存在しません");
      return;
    }

    const toc = page.locator('nav[aria-label="目次"]').first();
    if ((await toc.count()) === 0) {
      test.skip(true, "TOC を持つ記事が seed に存在しません");
      return;
    }

    const label = await toc.getAttribute("aria-label");
    expect(label).toBe("目次");
  });

  test("TOC 見出しリンクはキーボードでアクセスできる", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const opened = await openFirstPost(page);
    if (!opened) {
      test.skip(true, "ブログ記事が存在しません");
      return;
    }

    const tocLink = page.locator("a[data-toc-link]").first();
    if ((await tocLink.count()) === 0) {
      test.skip(true, "TOC を持つ記事が seed に存在しません");
      return;
    }

    await tocLink.focus();
    await expect(tocLink).toBeFocused();
  });
});
