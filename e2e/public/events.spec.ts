import { test, expect } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * 公開サイト - イベント E2E テスト
 *
 * テストシナリオ:
 * 1. /events イベント一覧ページの表示
 * 2. カレンダービュー / 一覧ビューの切替
 * 3. イベント詳細ページのナビゲーション
 * 4. 申込フォームの表示
 * 5. SEO メタデータ
 *
 * 前提条件:
 * - DB に seed されたイベントデータ（bun prisma/seed.ts --demo）
 * - 過去・未来両方のイベントが存在することが望ましい
 *
 * 注意: 実際の申込送信は Turnstile + email 送信を伴うため smoke test レベル。
 *       完全なフローは integration テストで担保。
 */

test.describe("公開イベント - 一覧ページ", () => {
  test("/events ページが正しく読み込まれる", async ({ page }) => {
    await page.goto(urls.events);
    await page.waitForLoadState("networkidle");

    const main = page.locator("main");
    await expect(main).toBeVisible();
    expect(page.url()).toContain("/events");
  });

  test("ページタイトルが設定されている", async ({ page }) => {
    await page.goto(urls.events);
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
    expect(title.toLowerCase()).toMatch(/event|イベント/);
  });

  test("カレンダーまたは一覧形式でイベントが表示される", async ({ page }) => {
    await page.goto(urls.events);
    await page.waitForLoadState("networkidle");

    // カレンダーグリッドまたはイベントカード/一覧のいずれかが表示
    const hasCalendar = await page
      .locator('[role="grid"], [class*="calendar"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasList = await page
      .locator('article, [class*="event-card"], [class*="event-item"]')
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmptyState = await page
      .getByText(/イベントはありません|イベントが見つかりません/i)
      .isVisible()
      .catch(() => false);

    // いずれかの状態が存在する（カレンダー / リスト / 空状態）
    expect(hasCalendar || hasList || hasEmptyState).toBeTruthy();
  });

  test("ヘッダー / フッターのレイアウトが表示される", async ({ page }) => {
    await page.goto(urls.events);
    await page.waitForLoadState("networkidle");

    await expect(page.locator('header[role="banner"]')).toBeVisible();
    await expect(page.locator('footer[role="contentinfo"]')).toBeVisible();
  });
});

test.describe("公開イベント - 詳細ページ遷移", () => {
  test("一覧からイベント詳細ページへの遷移ができる", async ({ page }) => {
    await page.goto(urls.events);
    await page.waitForLoadState("networkidle");

    // イベントへのリンクを取得（href に /events/{slug} を含む）
    const eventLink = page.locator('a[href*="/events/"]').first();
    const linkExists = await eventLink.count();

    if (linkExists === 0) {
      test.skip(
        true,
        "イベントデータがありません。bun prisma/seed.ts --demo を実行してください",
      );
      return;
    }

    await eventLink.click();
    await page.waitForLoadState("networkidle");

    // 詳細ページに遷移
    expect(page.url()).toMatch(/\/events\/[^/]+/);

    // メインコンテンツが表示
    await expect(page.locator("main")).toBeVisible();

    // 見出し（h1）があること
    await expect(page.locator("h1").first()).toBeVisible();
  });

  test("イベント詳細ページに申込ボタンまたは申込フォームが存在する", async ({
    page,
  }) => {
    await page.goto(urls.events);
    await page.waitForLoadState("networkidle");

    const eventLink = page.locator('a[href*="/events/"]').first();
    const linkExists = await eventLink.count();

    if (linkExists === 0) {
      test.skip(true, "イベントデータがありません");
      return;
    }

    await eventLink.click();
    await page.waitForLoadState("networkidle");

    // 申込ボタン or 申込締切表示 or 定員到達表示のいずれかが存在
    const hasRegisterButton = await page
      .getByRole("button", { name: /申込|参加申請|エントリー/i })
      .or(page.getByRole("link", { name: /申込|参加申請|エントリー/i }))
      .first()
      .isVisible()
      .catch(() => false);
    const hasClosedNotice = await page
      .getByText(/受付終了|申込締切|定員に達しました/i)
      .isVisible()
      .catch(() => false);

    expect(hasRegisterButton || hasClosedNotice).toBeTruthy();
  });
});
