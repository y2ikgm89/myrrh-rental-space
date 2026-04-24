import { test, expect, type Page } from "@playwright/test";
import { uniqueSlug, urls } from "../../fixtures";

async function createCustomPageAndOpenBuilder(
  page: Page,
  input: { slug: string; title: string },
): Promise<void> {
  await page.goto(urls.adminPages);
  await page.waitForLoadState("networkidle");

  const createButton = page
    .locator(
      'button:has-text("新規ページ"), button:has-text("新規作成"), a:has-text("新規ページ"), a:has-text("新規作成")',
    )
    .first();
  await expect(createButton).toBeVisible();
  await createButton.click();

  const dialog = page.locator('[role="dialog"]');
  await expect(dialog).toBeVisible();

  await dialog.locator("input#title").fill(input.title);
  await dialog.locator("input#slug").fill(input.slug);
  await dialog.locator('button:has-text("作成して builder を開く")').click();

  await page.waitForURL(new RegExp(`/admin/pages/${input.slug}(/builder)?$`), {
    timeout: 15000,
  });
}

test.describe("freeform page builder", () => {
  test("grid toggle は横幅が狭い管理画面でも表示される", async ({ page }) => {
    await page.setViewportSize({ width: 1260, height: 720 });

    const slug = uniqueSlug("builder-grid");
    const title = `builder-grid-${slug}`;

    await createCustomPageAndOpenBuilder(page, { slug, title });

    await expect(page.getByRole("button", { name: "Grid 8px" })).toBeVisible();
  });

  test("custom page を作成して save / restore / preview / publish できる", async ({
    page,
  }) => {
    test.slow();

    const slug = uniqueSlug("builder");
    const title = `builder-${slug}`;
    const firstHeading = `Builder heading ${slug} v1`;
    const secondHeading = `Builder heading ${slug} v2`;

    await createCustomPageAndOpenBuilder(page, { slug, title });

    await page.getByRole("tab", { name: "Insert" }).click();
    await page.getByRole("button", { name: /Hero Section/ }).click();
    await page.getByRole("tab", { name: "Layers" }).click();
    await expect(page.locator('button:has-text("Hero Section")')).toBeVisible();

    const pageTitleLayer = page
      .locator('button:has-text("Page Title")')
      .first();
    await expect(pageTitleLayer).toBeVisible();
    await pageTitleLayer.click();

    const textContentField = page
      .locator('label:has-text("Text Content")')
      .locator("..")
      .locator("textarea");
    await expect(textContentField).toBeVisible();

    await textContentField.fill(firstHeading);
    await page.locator('button:has-text("下書きを保存")').click();
    await expect(page.locator("[data-sonner-toaster]")).toContainText(
      "下書きを保存しました",
      { timeout: 10000 },
    );

    await textContentField.fill(secondHeading);
    await page.locator('button:has-text("下書きを保存")').click();
    await expect(page.locator("[data-sonner-toaster]")).toContainText(
      "下書きを保存しました",
      { timeout: 10000 },
    );

    await page.getByRole("tab", { name: "Revisions" }).click();
    const restoreButtons = page.locator('button:has-text("復元")');
    await expect(restoreButtons).toHaveCount(2, { timeout: 10000 });
    await restoreButtons.nth(1).click();

    const restoreDialog = page.locator('[role="alertdialog"]');
    await expect(restoreDialog).toContainText("revision を復元しますか？");
    await restoreDialog.locator('button:has-text("復元する")').click();
    await expect(page.locator("[data-sonner-toaster]")).toContainText(
      "を復元しました",
      { timeout: 10000 },
    );
    await expect(textContentField).toHaveValue(firstHeading);

    const [previewPage] = await Promise.all([
      page.waitForEvent("popup"),
      page.locator('a:has-text("プレビュー")').click(),
    ]);
    await previewPage.waitForLoadState("networkidle");
    await expect(previewPage.locator(`text=${firstHeading}`)).toBeVisible({
      timeout: 10000,
    });
    await previewPage.close();

    await page.locator('button:has-text("公開")').click();
    await expect(page.locator("[data-sonner-toaster]")).toContainText(
      "ページを公開しました",
      { timeout: 10000 },
    );

    const publicPage = await page.context().newPage();
    await publicPage.goto(`/${slug}`);
    await publicPage.waitForLoadState("networkidle");
    await expect(publicPage.locator(`text=${firstHeading}`)).toBeVisible({
      timeout: 10000,
    });
    await publicPage.close();
  });

  test("image node を media picker から選択して public page に公開できる", async ({
    page,
  }) => {
    test.slow();

    const slug = uniqueSlug("builder-image");
    const title = `builder-image-${slug}`;
    const imageAlt = "About ページのヒーロー画像";

    await createCustomPageAndOpenBuilder(page, { slug, title });

    await page.getByRole("tab", { name: "Insert" }).click();
    await page
      .locator('button:has-text("Image"):has-text("メディアライブラリ画像")')
      .click();

    await expect(page.locator('label:has-text("Image Asset")')).toBeVisible();
    await page.getByRole("button", { name: "画像を選択" }).click();

    const dialog = page.getByRole("dialog", { name: "メディアを選択" });
    await expect(dialog).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "ライブラリ" }),
    ).toBeVisible();

    await dialog.getByPlaceholder("画像を検索...").fill("page-about-hero");
    await expect(dialog.getByRole("button", { name: imageAlt })).toBeVisible({
      timeout: 10000,
    });
    await dialog.getByRole("button", { name: imageAlt }).click();
    await dialog.getByRole("button", { name: "挿入" }).click();

    await expect(page.getByText("asset: page-about-hero.svg")).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByAltText(imageAlt).first()).toBeVisible();

    await page.locator('button:has-text("下書きを保存")').click();
    await expect(page.locator("[data-sonner-toaster]")).toContainText(
      "下書きを保存しました",
      { timeout: 10000 },
    );

    await page.locator('button:has-text("公開")').click();
    await expect(page.locator("[data-sonner-toaster]")).toContainText(
      "ページを公開しました",
      { timeout: 10000 },
    );

    const publicPage = await page.context().newPage();
    await publicPage.goto(`/${slug}`);
    await publicPage.waitForLoadState("networkidle");
    await expect(publicPage.getByAltText(imageAlt)).toBeVisible({
      timeout: 10000,
    });
    await publicPage.close();
  });
});
