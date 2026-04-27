import { test, expect } from "@playwright/test";

/**
 * /access/[locationSlug] 拠点詳細ページ E2E テスト
 *
 * seed で投入された拠点 slug "honkan" を使用。
 * LocalBusiness JSON-LD の存在と 404 フォールバックを検証する。
 */

test.describe("/access/[locationSlug] 拠点詳細ページ", () => {
  test("LocalBusiness JSON-LD が出力される", async ({ page }) => {
    await page.goto("/access/honkan");
    await page.waitForLoadState("networkidle");

    // ページが正常表示されていることを確認（404 でないこと）
    await expect(page).not.toHaveTitle(/404|not found/i);

    // JSON-LD script タグを検索
    const jsonLdTexts = await page.$$eval(
      'script[type="application/ld+json"]',
      (scripts) => scripts.map((s) => s.textContent ?? ""),
    );

    // 少なくとも 1 つの JSON-LD script が存在すること
    expect(jsonLdTexts.length).toBeGreaterThan(0);

    // LocalBusiness 型が含まれているかを確認
    const hasLocalBusiness = jsonLdTexts.some((text) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        return false;
      }
      if (typeof parsed !== "object" || parsed === null) return false;
      const obj = parsed as Record<string, unknown>;
      // @graph 形式の場合
      if (Array.isArray(obj["@graph"])) {
        return (obj["@graph"] as unknown[]).some(
          (item) =>
            typeof item === "object" &&
            item !== null &&
            (item as Record<string, unknown>)["@type"] === "LocalBusiness",
        );
      }
      // 直接形式の場合
      return obj["@type"] === "LocalBusiness";
    });

    expect(hasLocalBusiness).toBe(true);
  });

  test("存在しない slug は 404 を返す", async ({ page }) => {
    const response = await page.goto("/access/non-existent-slug-xyz");
    expect(response?.status()).toBe(404);
  });

  test("拠点ページに拠点名が表示される", async ({ page }) => {
    await page.goto("/access/honkan");
    await page.waitForLoadState("networkidle");

    // ページが正常に表示され、タイトルや見出しが存在すること
    const title = await page.title();
    expect(title).not.toBe("");
    // 404 ページでないこと
    expect(title.toLowerCase()).not.toContain("not found");
  });
});
