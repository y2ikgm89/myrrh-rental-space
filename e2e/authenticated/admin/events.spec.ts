import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * 管理画面 - イベント管理 E2E テスト
 *
 * テストシナリオ:
 * 1. イベント一覧ページの表示とフィルター
 * 2. イベント作成フォームへの遷移
 * 3. イベント詳細・編集画面
 * 4. 申込者一覧の表示
 * 5. ソート / ステータスフィルター
 *
 * 前提条件:
 * - DB に seed されたイベントデータ
 * - 管理者ユーザーが作成済み
 */

// =============================================================================
// セットアップ
// =============================================================================

// =============================================================================
// 1. イベント一覧ページ
// =============================================================================

test.describe("イベント管理 - 一覧ページ", () => {
  test("イベント管理ページが正しく表示される", async ({ page }) => {
    await page.goto(urls.adminEvents);

    // ページ見出しに「イベント」が含まれる
    await expect(page.locator("h1").first()).toContainText(/イベント|Event/i);
  });

  test("新規作成ボタンが表示されている", async ({ page }) => {
    await page.goto(urls.adminEvents);

    const createButton = page
      .locator('a[href*="/admin/events/new"]')
      .or(page.getByRole("link", { name: /新規作成|新しいイベント|追加/i }))
      .first();
    await expect(createButton).toBeVisible();
  });

  test("テーブルまたはカード形式でイベント一覧が表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminEvents);

    // テーブル行 / カード / 空状態のいずれか
    const hasRows = await page
      .locator("tbody tr, [class*='event-row']")
      .first()
      .isVisible()
      .catch(() => false);
    const hasEmptyState = await page
      .getByText(/イベントがありません|データがありません/i)
      .isVisible()
      .catch(() => false);

    expect(hasRows || hasEmptyState).toBeTruthy();
  });
});

// =============================================================================
// 2. 新規作成画面
// =============================================================================

test.describe("イベント管理 - 新規作成", () => {
  test("新規作成ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminEvents);

    const createButton = page
      .locator('a[href*="/admin/events/new"]')
      .or(page.getByRole("link", { name: /新規作成|新しいイベント|追加/i }))
      .first();
    await createButton.click();

    expect(page.url()).toContain("/admin/events/new");

    // フォームが表示される
    await expect(page.locator("form").first()).toBeVisible();
  });

  test("必須フィールド（タイトル / 日時）の入力欄が存在する", async ({
    page,
  }) => {
    await page.goto("/admin/events/new");

    // タイトル入力欄
    const titleInput = page
      .locator('input[name="title"]')
      .or(page.getByLabel(/タイトル/i))
      .first();
    await expect(titleInput).toBeVisible();

    // 開始日時 / 終了日時の入力欄
    const startTimeInput = page.getByLabel("開始日時");
    await expect(startTimeInput).toBeVisible();

    const endTimeInput = page.getByLabel("終了日時");
    await expect(endTimeInput).toBeVisible();
  });
});
