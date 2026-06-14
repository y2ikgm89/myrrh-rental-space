import { test, expect } from "@playwright/test";

/**
 * Smoke: レガシー URL リダイレクト
 *
 * 目的: 公開済み URL の恒久移行（/posts → /blog）が 308 で機能することのゲート。
 * next.config の redirects() は routing / DB より前に評価されるため、DB 状態に
 * 依存せず redirect ステータスのみを検証できる（fail-closed で 200 や 404 を即検知）。
 *
 * 業界標準: 移動した公開 URL は Google 公式が恒久リダイレクト（301/308）を推奨。
 * https://developers.google.com/search/docs/crawling-indexing/site-move-with-url-changes
 */

test.describe("smoke: legacy URL redirects", () => {
  test("/posts は /blog へ 308 恒久リダイレクト", async ({ request }) => {
    const res = await request.get("/posts", { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    // Next.js は相対 / 絶対どちらの Location も出しうるため末尾一致で検証
    expect(res.headers()["location"]).toMatch(/\/blog$/);
  });

  test("/posts/:path* は /blog/:path* へ 308 恒久リダイレクト", async ({
    request,
  }) => {
    const res = await request.get("/posts/example-article", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(308);
    expect(res.headers()["location"]).toMatch(/\/blog\/example-article$/);
  });
});
