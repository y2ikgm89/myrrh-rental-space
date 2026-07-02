import { test, expect } from "@playwright/test";

/**
 * 管理画面 - Lexical InlineIcon E2E（管理者認証済み state）
 *
 * Phase 3: Lexical 本文に inline curated icon を挿入する slash command の smoke test。
 *
 * シナリオ:
 *   1. ブログ新規作成画面で editor が起動する
 *   2. `/` を入力するとスラッシュコマンドの ComponentPicker が表示される
 *   3. 「アイコン」項目（structure カテゴリ）が候補に存在する
 *   4. 「アイコン」を選択すると IconPickerDialog が開く
 *   5. dialog の検索欄でアイコンを絞り込み → 選択 → 確定
 *   6. editor 本文に `[data-lexical-inline-icon]` 要素が挿入される
 *
 * 前提:
 *   - playwright.config.ts の chromium-admin project で実行
 *   - setup-admin により admin user が認証済み
 *   - dev サーバー稼働中
 *
 * 設計:
 *   - 実 OAuth / 実 DB write は不要（editor 内挿入の DOM 表現のみ検証）
 *   - InlineIconPlugin の domain 動作は unit test 側で担保（contenteditable + slash trigger）
 *   - 本 spec は ComponentPicker → Dialog → 挿入確認の **flow smoke** に集中
 */

const NEW_POST_PATH = "/admin/posts/new";

test.describe("Lexical InlineIcon - slash command 挿入", () => {
  test("/ を入力すると ComponentPicker に「アイコン」候補が表示される", async ({
    page,
  }) => {
    await page.goto(NEW_POST_PATH);

    const editor = page
      .getByRole("region", { name: "本文エディタ" })
      .getByRole("textbox");
    await expect(editor).toBeVisible({ timeout: 15000 });

    await editor.click();
    await page.keyboard.type("/icon");

    // ComponentPicker (typeahead) が dropdown 表示される
    // 公式 Lexical は role="listbox"、項目は role="option"
    const componentPicker = page.getByRole("listbox", {
      name: "ブロックを挿入",
    });
    const iconOption = componentPicker.getByRole("option", {
      name: "アイコン",
    });
    await expect(iconOption).toBeVisible({ timeout: 5000 });
  });

  test("「アイコン」を選択すると IconPickerDialog が開く", async ({ page }) => {
    await page.goto(NEW_POST_PATH);

    const editor = page
      .getByRole("region", { name: "本文エディタ" })
      .getByRole("textbox");
    await expect(editor).toBeVisible({ timeout: 15000 });

    await editor.click();
    await page.keyboard.type("/icon");

    const componentPicker = page.getByRole("listbox", {
      name: "ブロックを挿入",
    });
    const iconOption = componentPicker.getByRole("option", {
      name: "アイコン",
    });
    await expect(iconOption).toBeVisible({ timeout: 5000 });
    await iconOption.click();

    // IconPickerDialog の DialogTitle（heading role で footer の "アイコンを選択してください" と区別）
    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "アイコンを選択" }),
    ).toBeVisible({ timeout: 5000 });
  });

  test("Dialog で icon を選択 → 確定で editor に inline icon が挿入される", async ({
    page,
  }) => {
    await page.goto(NEW_POST_PATH);

    const editor = page
      .getByRole("region", { name: "本文エディタ" })
      .getByRole("textbox");
    await expect(editor).toBeVisible({ timeout: 15000 });

    await editor.click();
    await page.keyboard.type("/icon");

    const componentPicker = page.getByRole("listbox", {
      name: "ブロックを挿入",
    });
    const iconOption = componentPicker.getByRole("option", {
      name: "アイコン",
    });
    await iconOption.click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "アイコンを選択" }),
    ).toBeVisible({ timeout: 5000 });

    // 検索欄で絞り込み（aria-label="アイコンを検索" の `<input type="search">`）
    const searchInput = dialog.getByLabel("アイコンを検索");
    await expect(searchInput).toBeVisible();
    await searchInput.fill("clock");

    const clockIconButton = dialog.getByRole("button", {
      name: "時計（IconClock）",
    });
    await expect(clockIconButton).toBeVisible({ timeout: 5000 });
    await clockIconButton.click();

    // 確定ボタンは「選択」（実装: IconPickerDialog.tsx の primary action）
    await dialog.getByRole("button", { name: "選択", exact: true }).click();

    // editor に inline-icon DOM が挿入される（編集中 DOM は data-icon-name を持たない）
    await expect(editor.locator("[data-lexical-inline-icon]")).toHaveCount(1, {
      timeout: 5000,
    });
  });
});
