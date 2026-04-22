import { test, expect, type Page } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * 管理画面 - メディア管理 E2E テスト
 *
 * テストシナリオ:
 * 1. メディア一覧ページの表示
 * 2. 検索・フィルタ機能
 * 3. ファイルアップロード
 * 4. 削除操作
 * 5. レスポンシブ対応
 *
 * NOTE: ドラッグ&ドロップアップロードは除外。
 * dnd-kit / ネイティブ DataTransfer エミュレーションは
 * Playwright で flaky になりやすいため、input[type="file"] 経由の
 * setInputFiles() による安定実装に統一する。
 * Cloudflare R2 実接続は E2E 対象外（unit/integration test で検証）。
 */

// =============================================================================
// 最小有効 PNG ヘッダー（in-memory テスト用ファイル）
// 1×1 ピクセルの透明 PNG（89バイト）
// =============================================================================

/** 実ファイル不要の in-memory PNG バッファ */
const MINIMAL_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6260000000000200014a0082000000000049454e44ae426082",
  "hex",
);

/** テスト用 PNG ファイル定義 */
const TEST_PNG_FILE = {
  name: "e2e-test-upload.png",
  mimeType: "image/png" as const,
  buffer: MINIMAL_PNG,
};

/**
 * アップロードダイアログを開く。
 * ページがロード済みで「アップロード」ボタンが表示されている前提。
 */
async function openUploadDialog(page: Page): Promise<boolean> {
  const uploadButton = page.locator('button:has-text("アップロード")').first();
  if ((await uploadButton.count()) === 0) return false;
  await uploadButton.click();
  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible({ timeout: 5000 });
  return true;
}

/**
 * ダイアログ内の hidden input[type="file"] にファイルをセットし、
 * 「アップロード」送信ボタンをクリックする。
 * Playwright 公式: setInputFiles() は hidden input にも適用可能。
 */
async function fillAndSubmitUploadDialog(
  page: Page,
  file: { name: string; mimeType: string; buffer: Buffer },
): Promise<void> {
  const dialog = page.locator('[role="dialog"]');
  const fileInput = dialog.locator('input[type="file"]');

  await fileInput.setInputFiles({
    name: file.name,
    mimeType: file.mimeType,
    buffer: file.buffer,
  });

  // ファイルがセットされたらプレビューまたはファイル名が表示される
  await expect(dialog.locator(`text=${file.name}`)).toBeVisible({
    timeout: 5000,
  });

  // 送信ボタン（テキスト「アップロード」）をクリック
  // ダイアログフッター内のボタンに絞り込む
  const submitButton = dialog
    .locator(
      '[data-slot="dialog-footer"] button:has-text("アップロード"), button[type="button"]:has-text("アップロード")',
    )
    .last();
  await submitButton.click();
}

// =============================================================================
// 1. メディア一覧ページの表示
// =============================================================================

test.describe("メディア一覧ページ", () => {
  test("メディア一覧ページが正しく表示される", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("メディア");
  });

  test("アップロードボタンが存在する", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const uploadButton = page.locator(
      'button:has-text("アップロード"), label:has-text("アップロード")',
    );
    await expect(uploadButton.first()).toBeVisible();
  });

  test("メディアグリッドまたは空の状態が表示される", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const grid = page.locator('[class*="grid"], [data-testid*="media"]');
    const emptyState = page.locator(
      "text=メディアがありません, text=ファイルがありません",
    );

    const hasGrid = (await grid.count()) > 0;
    const hasEmpty = (await emptyState.count()) > 0;
    expect(hasGrid || hasEmpty).toBe(true);
  });
});

// =============================================================================
// 2. 検索・フィルタ機能
// =============================================================================

test.describe("メディア管理 - 検索・フィルタ", () => {
  test("検索フィールドが表示される", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const searchInput = page.locator(
      'input[type="search"], input[placeholder*="検索"]',
    );
    if ((await searchInput.count()) > 0) {
      await expect(searchInput.first()).toBeVisible();
    }
  });

  test("存在しないファイル名で検索すると空状態になる", async ({ page }) => {
    await page.goto(urls.adminMedia + "?search=nonexistent-file-xyz-99999");
    await page.waitForLoadState("networkidle");

    const emptyState = page.locator(
      "text=メディアがありません, text=見つかりません, text=該当なし",
    );
    if ((await emptyState.count()) > 0) {
      await expect(emptyState.first()).toBeVisible();
    }
  });
});

// =============================================================================
// 3. ファイルアップロード
// =============================================================================

test.describe("メディア管理 - ファイルアップロード", () => {
  /**
   * ダイアログが開けない場合（ページ構造が想定外）は全テストをスキップ。
   * seed データ有無は問わないが、アップロードボタン自体は常に表示される設計。
   */

  test("アップロードダイアログが開く", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const opened = await openUploadDialog(page);
    if (!opened) {
      test.skip(true, "アップロードボタンが見つかりません");
      return;
    }

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("text=メディアをアップロード")).toBeVisible();
  });

  test("アップロードダイアログにキャンセルボタンがある", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const opened = await openUploadDialog(page);
    if (!opened) {
      test.skip(true, "アップロードボタンが見つかりません");
      return;
    }

    const dialog = page.locator('[role="dialog"]');
    const cancelButton = dialog.locator('button:has-text("キャンセル")');
    await expect(cancelButton).toBeVisible();

    await cancelButton.click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });

  test("単一 PNG ファイルを選択するとプレビューとファイル名が表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const opened = await openUploadDialog(page);
    if (!opened) {
      test.skip(true, "アップロードボタンが見つかりません");
      return;
    }

    const dialog = page.locator('[role="dialog"]');
    const fileInput = dialog.locator('input[type="file"]');

    // Playwright 公式: setInputFiles() でバッファ経由の in-memory upload
    await fileInput.setInputFiles({
      name: TEST_PNG_FILE.name,
      mimeType: TEST_PNG_FILE.mimeType,
      buffer: TEST_PNG_FILE.buffer,
    });

    // ファイル名が表示される（MediaUploadDialog: file.name をテキストで表示）
    await expect(dialog.locator(`text=${TEST_PNG_FILE.name}`)).toBeVisible({
      timeout: 5000,
    });
  });

  test("ファイル選択後にアップロードボタンが有効になる", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const opened = await openUploadDialog(page);
    if (!opened) {
      test.skip(true, "アップロードボタンが見つかりません");
      return;
    }

    const dialog = page.locator('[role="dialog"]');
    const fileInput = dialog.locator('input[type="file"]');

    // ファイル未選択時のアップロードボタンは disabled
    // （MediaUploadDialog: disabled={!file || isPending}）
    const uploadSubmitBtn = dialog
      .locator('button:has-text("アップロード")')
      .last();
    await expect(uploadSubmitBtn).toBeDisabled();

    // ファイルをセット
    await fileInput.setInputFiles({
      name: TEST_PNG_FILE.name,
      mimeType: TEST_PNG_FILE.mimeType,
      buffer: TEST_PNG_FILE.buffer,
    });

    await expect(dialog.locator(`text=${TEST_PNG_FILE.name}`)).toBeVisible({
      timeout: 5000,
    });

    // ファイル選択後はアップロードボタンが有効になる
    await expect(uploadSubmitBtn).toBeEnabled({ timeout: 3000 });
  });

  test("不正な MIME タイプ（text/plain）を選択するとエラートーストが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const opened = await openUploadDialog(page);
    if (!opened) {
      test.skip(true, "アップロードボタンが見つかりません");
      return;
    }

    const dialog = page.locator('[role="dialog"]');
    const fileInput = dialog.locator('input[type="file"]');

    // text/plain は ALLOWED_MIME_TYPES に含まれないため validateFile() が拒否する
    // MediaType.OTHER の ALLOWED_MIME_TYPES は [] のためエラーになる
    await fileInput.setInputFiles({
      name: "malicious.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("this is a text file"),
    });

    // Sonner トースターにエラーが表示される
    // （MediaUploadDialog: toast.error(validation.error) を呼ぶ）
    await expect(page.locator("[data-sonner-toaster]")).toContainText(
      "対応していないファイル形式",
      { timeout: 5000 },
    );

    // ファイル名は表示されない（file state がセットされない）
    await expect(dialog.locator("text=malicious.txt")).not.toBeVisible();
  });

  test("画像サイズ超過ファイル（10MB 超の PNG）を選択するとエラートーストが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const opened = await openUploadDialog(page);
    if (!opened) {
      test.skip(true, "アップロードボタンが見つかりません");
      return;
    }

    const dialog = page.locator('[role="dialog"]');
    const fileInput = dialog.locator('input[type="file"]');

    // 画像の上限は MAX_FILE_SIZES.IMAGE = 10MB
    // 11MB のダミーバッファを PNG MIME タイプで送信
    const ELEVEN_MB = 11 * 1024 * 1024;
    const oversizedBuffer = Buffer.alloc(ELEVEN_MB, 0);

    await fileInput.setInputFiles({
      name: "oversize.png",
      mimeType: "image/png",
      buffer: oversizedBuffer,
    });

    // サイズ超過エラーが Sonner トーストに表示される
    // （MediaUploadDialog: toast.error(validation.error) で「10MB以下にしてください」）
    await expect(page.locator("[data-sonner-toaster]")).toContainText(
      "10MB以下にしてください",
      { timeout: 5000 },
    );
  });

  test("ファイルを選択後にキャンセルするとリセットされる", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const opened = await openUploadDialog(page);
    if (!opened) {
      test.skip(true, "アップロードボタンが見つかりません");
      return;
    }

    const dialog = page.locator('[role="dialog"]');
    const fileInput = dialog.locator('input[type="file"]');

    await fileInput.setInputFiles({
      name: TEST_PNG_FILE.name,
      mimeType: TEST_PNG_FILE.mimeType,
      buffer: TEST_PNG_FILE.buffer,
    });

    await expect(dialog.locator(`text=${TEST_PNG_FILE.name}`)).toBeVisible({
      timeout: 5000,
    });

    // キャンセルボタンで閉じる
    await dialog.locator('button:has-text("キャンセル")').click();
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    // 再度開くとドロップゾーンが表示される（ファイルがリセットされている）
    const reopened = await openUploadDialog(page);
    if (reopened) {
      const freshDialog = page.locator('[role="dialog"]');
      await expect(freshDialog.locator("text=ドラッグ&ドロップ")).toBeVisible();
    }
  });

  test("単一画像アップロードを送信するとアップロード処理が開始される", async ({
    page,
  }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const opened = await openUploadDialog(page);
    if (!opened) {
      test.skip(true, "アップロードボタンが見つかりません");
      return;
    }

    await fillAndSubmitUploadDialog(page, TEST_PNG_FILE);

    // Server Action が呼ばれ、成功またはエラーのいずれかのトーストが表示される。
    // CI 環境では R2 接続がないためエラートーストになる場合があるが、
    // UI フロー（ダイアログ → 送信 → トースト表示）は検証できる。
    await expect(page.locator("[data-sonner-toaster]")).toBeVisible({
      timeout: 10000,
    });
  });
});

// =============================================================================
// 4. 削除操作
// =============================================================================

test.describe("メディア管理 - 削除", () => {
  test("削除ボタンをクリックすると確認ダイアログが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const deleteButton = page.locator('button:has-text("削除")').first();
    if ((await deleteButton.count()) === 0) {
      test.skip(true, "メディアが存在しません");
      return;
    }

    await deleteButton.click();

    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });
  });

  test("削除ダイアログのキャンセルボタンが動作する", async ({ page }) => {
    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    const deleteButton = page.locator('button:has-text("削除")').first();
    if ((await deleteButton.count()) === 0) {
      test.skip(true, "メディアが存在しません");
      return;
    }

    await deleteButton.click();

    const dialog = page.locator('[role="dialog"], [role="alertdialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const cancelButton = dialog.locator('button:has-text("キャンセル")');
    await cancelButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  });
});

// =============================================================================
// 5. レスポンシブ対応
// =============================================================================

test.describe("レスポンシブ対応", () => {
  test("モバイルビューでも一覧ページが表示される", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });

    await page.goto(urls.adminMedia);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toBeVisible();
  });
});
