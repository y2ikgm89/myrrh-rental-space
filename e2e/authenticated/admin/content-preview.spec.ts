import { test, expect, type Locator, type Page } from "@playwright/test";

function uniqueSlug(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}`;
}

async function openSettingsDialog(page: Page, name: string) {
  await page.getByRole("button", { name }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

async function typeBody(page: Page, text: string) {
  const editor = page
    .getByRole("region", { name: "本文エディタ" })
    .getByRole("textbox");
  await expect(editor).toBeVisible({ timeout: 15000 });
  await editor.click();
  await page.keyboard.type(text);
}

async function fillTitleAndSlug(dialog: Locator, title: string, slug: string) {
  await dialog
    .getByRole("textbox", { name: "タイトル", exact: true })
    .fill(title);
  await dialog
    .getByRole("textbox", { name: "スラッグ（URL）", exact: true })
    .fill(slug);
}

async function expectPreviewBody(preview: Page, text: string) {
  await expect(
    preview.locator("#main-content").getByText(text).first(),
  ).toBeVisible();
}

test.describe("content preview", () => {
  test("投稿編集プレビューは設定と本文を保存して表示する", async ({ page }) => {
    const suffix = Date.now().toString(36);
    const title = `E2E 投稿プレビュー ${suffix}`;
    const slug = uniqueSlug("e2e-post-preview");
    const body = `E2E 投稿本文プレビュー ${suffix}`;

    await page.goto("/admin/posts");

    const firstPostRow = page.getByRole("row", {
      name: / の投稿を編集/,
    });
    await expect(firstPostRow.first()).toBeVisible({ timeout: 15000 });
    await firstPostRow.first().click();

    await expect(
      page.getByRole("region", { name: "本文エディタ" }).getByRole("textbox"),
    ).toBeVisible({ timeout: 15000 });

    const dialog = await openSettingsDialog(page, "記事設定を開く");
    await fillTitleAndSlug(dialog, title, slug);
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(dialog).toBeHidden();

    await typeBody(page, body);

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "プレビュー" }).click();
    const preview = await popupPromise;

    await expect(preview).toHaveURL(/\/preview\/posts\/[0-9a-f-]+/u, {
      timeout: 15000,
    });
    await expect(preview.getByRole("heading", { name: title })).toBeVisible({
      timeout: 15000,
    });
    await expectPreviewBody(preview, body);
  });

  test("お知らせ新規作成プレビューは入力内容を下書き保存して表示する", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36);
    const title = `E2E お知らせプレビュー ${suffix}`;
    const slug = uniqueSlug("e2e-news-preview");
    const body = `E2E お知らせ本文プレビュー ${suffix}`;

    await page.goto("/admin/news/new");
    await expect(
      page.getByRole("region", { name: "本文エディタ" }).getByRole("textbox"),
    ).toBeVisible({ timeout: 15000 });

    const dialog = await openSettingsDialog(page, "お知らせ設定を開く");
    await fillTitleAndSlug(dialog, title, slug);
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(dialog).toBeHidden();

    await typeBody(page, body);

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "プレビュー" }).click();
    const preview = await popupPromise;

    await expect(preview).toHaveURL(/\/preview\/news\/[0-9a-f-]+/u, {
      timeout: 15000,
    });
    await expect(preview.getByRole("heading", { name: title })).toBeVisible({
      timeout: 15000,
    });
    await expectPreviewBody(preview, body);
    await expect(page).toHaveURL(/\/admin\/news\/[0-9a-f-]+/u, {
      timeout: 15000,
    });
  });

  test("規約新規作成プレビューは別タブ設定保存後も入力内容を表示する", async ({
    page,
  }) => {
    const suffix = Date.now().toString(36);
    const title = `E2E 規約プレビュー ${suffix}`;
    const slug = uniqueSlug("e2e-terms-preview");
    const body = `E2E 規約本文プレビュー ${suffix}`;

    await page.goto("/admin/terms/new");
    await expect(
      page.getByRole("region", { name: "本文エディタ" }).getByRole("textbox"),
    ).toBeVisible({ timeout: 15000 });

    const dialog = await openSettingsDialog(page, "利用規約設定を開く");
    await fillTitleAndSlug(dialog, title, slug);
    await dialog.getByRole("tab", { name: "同意必須にする画面" }).click();
    await dialog.getByLabel("変更内容のメモ").fill(`E2E changelog ${suffix}`);
    await dialog.getByRole("button", { name: "保存" }).click();
    await expect(dialog).toBeHidden();

    await typeBody(page, body);

    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "プレビュー" }).click();
    const preview = await popupPromise;

    await expect(preview).toHaveURL(/\/preview\/terms\/[0-9a-f-]+/u, {
      timeout: 15000,
    });
    await expect(preview.getByRole("heading", { name: title })).toBeVisible({
      timeout: 15000,
    });
    await expectPreviewBody(preview, body);
    await expect(page).toHaveURL(/\/admin\/terms\/[0-9a-f-]+\/edit/u, {
      timeout: 15000,
    });
  });

  test("固定ページ編集プレビューは保存済みページを別タブで表示する", async ({
    page,
  }) => {
    await page.goto("/admin/pages/home/edit");

    const previewLink = page.getByRole("link", { name: "プレビュー" });
    await expect(previewLink).toBeVisible({ timeout: 15000 });

    const popupPromise = page.waitForEvent("popup");
    await previewLink.click();
    const preview = await popupPromise;

    await expect(preview).toHaveURL(/\/preview\/pages\/home/u, {
      timeout: 15000,
    });
    await expect(preview.getByText("プレビューモード").first()).toBeVisible({
      timeout: 15000,
    });
    await expect(preview.locator("#main-content")).toBeVisible();
  });
});
