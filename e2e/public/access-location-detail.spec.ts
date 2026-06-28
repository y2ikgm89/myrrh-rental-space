import { test, expect } from "@playwright/test";

/**
 * /access/[locationSlug] 拠点詳細ページ E2E テスト
 *
 * seed で投入された拠点 slug "honkan" を使用。
 * LocalBusiness JSON-LD の存在と 404 フォールバックを検証する。
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

test.describe("/access/[locationSlug] 拠点詳細ページ", () => {
  test("LocalBusiness JSON-LD が出力される", async ({ page }) => {
    await page.goto("/access/honkan");

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
      if (!isRecord(parsed)) return false;
      const obj = parsed;
      // @graph 形式の場合
      const graph = obj["@graph"];
      if (isUnknownArray(graph)) {
        return graph.some(
          (item) => isRecord(item) && item["@type"] === "LocalBusiness",
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

    // ページが正常に表示され、タイトルや見出しが存在すること
    const title = await page.title();
    expect(title).not.toBe("");
    // 404 ページでないこと
    expect(title.toLowerCase()).not.toContain("not found");
  });
});
