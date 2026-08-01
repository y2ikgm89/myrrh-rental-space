import { test, expect } from "../fixtures/e2e-test";

/**
 * /access 拠点情報ページ E2E テスト
 *
 * seed で投入された拠点 slug "honkan" を使用。
 * 現行の拠点 URL は個別詳細ページではなく /access#slug。
 * LocalBusiness JSON-LD は /access の @graph に集約して検証する。
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

async function pageHasLocalBusinessJsonLd(
  page: import("@playwright/test").Page,
): Promise<boolean> {
  const jsonLdTexts = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();

  return jsonLdTexts.some((text) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return false;
    }
    if (!isRecord(parsed)) return false;
    const obj = parsed;
    const graph = obj["@graph"];
    if (isUnknownArray(graph)) {
      return graph.some(
        (item) => isRecord(item) && item["@type"] === "LocalBusiness",
      );
    }
    return obj["@type"] === "LocalBusiness";
  });
}

test.describe("/access 拠点情報ページ", () => {
  test("LocalBusiness JSON-LD が /access の @graph に出力される", async ({
    page,
  }) => {
    await page.goto("/access");

    await expect(
      page.getByRole("heading", { name: "アクセス", level: 2 }),
    ).toBeVisible();
    await expect.poll(() => pageHasLocalBusinessJsonLd(page)).toBe(true);
  });

  test("存在しない入れ子 slug は not-found UI を表示する", async ({ page }) => {
    await page.goto("/access/non-existent-slug-xyz");

    await expect(
      page.getByRole("heading", { name: "ページが見つかりません", level: 1 }),
    ).toBeVisible();
  });

  test("拠点ページに拠点情報が表示される", async ({ page }) => {
    await page.goto("/access");

    await expect(page).not.toHaveTitle(/404|not found/i);
    await expect(
      page.getByRole("heading", { name: "本館", level: 2 }),
    ).toBeVisible();
  });

  test("非公開拠点（新宿支店 / shinjuku-ten, isPublished: false）は表示されない", async ({
    page,
  }) => {
    await page.goto("/access");

    // 公開拠点（本館）が描画されるまで待ってから非公開拠点の不在を確認する
    // （データ取得前のフライング判定を避ける）。
    await expect(
      page.getByRole("heading", { name: "本館", level: 2 }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "新宿支店", level: 2 }),
    ).toHaveCount(0);

    // JSON-LD の LocalBusiness 一覧にも非公開拠点の name/slug アンカーを含めない
    // （public-queries.ts の isPublished gate の回帰テスト）。
    const jsonLdTexts = await page
      .locator('script[type="application/ld+json"]')
      .allTextContents();
    const hasShinjukuInJsonLd = jsonLdTexts.some(
      (text) => text.includes("新宿支店") || text.includes("shinjuku-ten"),
    );
    expect(hasShinjukuInJsonLd).toBe(false);
  });
});
