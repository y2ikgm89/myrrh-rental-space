import { Buffer } from "node:buffer";

import { test, expect, type Page } from "@playwright/test";
import { urls } from "../fixtures";

/**
 * Visual Regression テスト（公開ページ）
 *
 * Playwright 公式の `toHaveScreenshot` + baseline snapshot パターンで
 * 主要公開ページの視覚的回帰を検出する。
 *
 * 参照: https://playwright.dev/docs/test-snapshots
 *
 * 【opt-in 実行】
 *
 * デフォルトは skip。environment variable `PLAYWRIGHT_VISUAL=1` で有効化:
 *
 *   # 初回 baseline 生成（必須）
 *   PLAYWRIGHT_VISUAL=1 bunx playwright test e2e/visual --update-snapshots
 *
 *   # 以降の回帰検証
 *   PLAYWRIGHT_VISUAL=1 bunx playwright test e2e/visual
 *
 * 【設計原則】
 *
 * - **hermetic**: 外部ネットワークに依存しない（{@link installHermeticNetwork}）。
 *   これが visual regression の前提条件で、無いと baseline を更新しても収束しない
 * - `animations: "disabled"` で CSS transition/animation を無効化
 *   （Kinfolk-style subtle animations の flaky 回避）
 * - 動的要素（日付・時刻・お知らせバー等）は `mask` で pink box
 * - `fullPage: true` で above-the-fold 以外の regression も検出
 * - `toHaveScreenshot` 公式の連続 screenshot 安定化待ちに任せる
 *   （収束余裕は {@link SNAPSHOT_STABILIZATION_TIMEOUT_MS}）
 * - `maxDiffPixelRatio: 0.01` で 1% 以内の微差は許容（フォント微調整等）
 *
 * 【baseline 管理】
 *
 * **canonical baseline は CI Ubuntu runner が生成する `*-linux.png` のみ**。
 * `--update-snapshots` を Windows / macOS のローカルで実行して commit しないこと
 * （フォントラスタライズが CI と一致せず、CI 側が必ず落ちる）。
 * 再生成は `workflow_dispatch` の `update_visual_baseline=true` で行い、
 * CI が別 branch + auto-PR を作る（required checks を通してから merge する）。
 * ローカルで CI と同じ描画を得たい場合は Playwright 公式 Docker イメージ
 * (`mcr.microsoft.com/playwright:v1.61.1-noble`) を使う。
 * CI / レビュー時の差分は playwright-report で確認。
 */

const VISUAL_ENABLED = process.env["PLAYWRIGHT_VISUAL"] === "1";

/**
 * `toHaveScreenshot` は「連続 2 枚が一致するまで」撮り直す。full-page で 7 ページ分の
 * hydration + 画像描画を待つには既定の expect timeout (5s) は短く、収束前に打ち切られると
 * 「ページ側は正常なのに fail」になる。hermetic 化で揺れは止まる前提だが、CI runner の
 * 負荷差を吸収する余裕を明示的に持たせる。
 */
const SNAPSHOT_STABILIZATION_TIMEOUT_MS = 20_000;

/** 1x1 PNG。next/image のレスポンス差し替え用（レイアウトは CSS 側が決めるため寸法は無関係）。 */
const STUB_IMAGE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

/**
 * visual snapshot を hermetic（外部ネットワーク非依存）にする。
 *
 * これが無いと full-page の高さが実行ごとに変わり、`toHaveScreenshot` の
 * 連続撮影安定化が収束しない（2026-07-30 の full CI dispatch では homepage が
 * 4211 / 4404 / 4564px と揺れ、baseline 更新でも直らない状態だった）。
 *
 * 1. `/_next/image` — CI の `R2_PUBLIC_URL` は `https://example.com` のダミーで、
 *    Next の image optimizer が**実際に外部へ HTTP 取得しに行く**。成否とレイテンシが
 *    毎回変わるため、画像の描画有無＝レイアウト高さが非決定になる。固定 PNG で差し替える。
 * 2. Cloudflare Turnstile — 外部 iframe の読込タイミングで contact ページの高さが変動する
 *    （2123 / 2024px）。visual の対象外なので読ませない。
 *
 * 注: Playwright の route handler は**後に登録したものから**照合されるため、
 * catch-all ではなく個別 pattern を素直に並べている。
 */
const installHermeticNetwork = async (page: Page) => {
  await page.route("**/_next/image**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/png",
      body: STUB_IMAGE_PNG,
    });
  });
  await page.route("https://challenges.cloudflare.com/**", async (route) => {
    await route.abort();
  });
};

const preparePageForVisualSnapshot = async (
  page: Page,
  headingName: string | RegExp,
) => {
  await expect(page.getByRole("main")).toBeVisible();
  const heading =
    typeof headingName === "string"
      ? page.getByRole("heading", { name: headingName, exact: true })
      : page.getByRole("heading", { name: headingName });
  await expect(heading).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
};

test.describe("Visual Regression - 公開ページ主要ルート", () => {
  // opt-in ガード
  test.skip(
    !VISUAL_ENABLED,
    "visual regression は PLAYWRIGHT_VISUAL=1 で有効化",
  );

  // 動的コンテンツ（日付・時刻・お知らせバー等）を mask するための共通 locator
  const dynamicMaskLocators = (page: Page) => [
    // お知らせバー（カルーセル・現在時刻依存）
    page.locator('[class*="announcement" i]'),
    // 日時・タイムスタンプ要素
    page.locator("time, [datetime]"),
    // Instagram 動的フィード
    page.locator('[class*="instagram" i]'),
  ];

  // GSAP / CSS animations が prefers-reduced-motion を見て止まる前提で reduce を強制
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installHermeticNetwork(page);
  });

  test("ホームページ - above-the-fold + full page snapshot", async ({
    page,
  }) => {
    await page.goto(urls.home);

    await preparePageForVisualSnapshot(page, /Where silence works\./);

    await expect(page).toHaveScreenshot("homepage.png", {
      fullPage: true,
      animations: "disabled",
      timeout: SNAPSHOT_STABILIZATION_TIMEOUT_MS,
      mask: dynamicMaskLocators(page),
      maxDiffPixelRatio: 0.01,
    });
  });

  test("スペース一覧ページ - full page snapshot", async ({ page }) => {
    await page.goto(urls.spaces);
    await preparePageForVisualSnapshot(page, "スペース一覧");

    await expect(page).toHaveScreenshot("spaces-list.png", {
      fullPage: true,
      animations: "disabled",
      timeout: SNAPSHOT_STABILIZATION_TIMEOUT_MS,
      mask: dynamicMaskLocators(page),
      maxDiffPixelRatio: 0.01,
    });
  });

  test("ブログ一覧ページ - full page snapshot", async ({ page }) => {
    await page.goto(urls.blog);
    await preparePageForVisualSnapshot(page, "ブログ");

    await expect(page).toHaveScreenshot("blog-list.png", {
      fullPage: true,
      animations: "disabled",
      timeout: SNAPSHOT_STABILIZATION_TIMEOUT_MS,
      mask: dynamicMaskLocators(page),
      maxDiffPixelRatio: 0.01,
    });
  });

  test("お知らせ一覧ページ - full page snapshot", async ({ page }) => {
    await page.goto(urls.news);
    await preparePageForVisualSnapshot(page, "お知らせ");

    await expect(page).toHaveScreenshot("news-list.png", {
      fullPage: true,
      animations: "disabled",
      timeout: SNAPSHOT_STABILIZATION_TIMEOUT_MS,
      mask: dynamicMaskLocators(page),
      maxDiffPixelRatio: 0.01,
    });
  });

  test("FAQ ページ - full page snapshot", async ({ page }) => {
    await page.goto(urls.faq);
    await preparePageForVisualSnapshot(page, "よくある質問");

    await expect(page).toHaveScreenshot("faq.png", {
      fullPage: true,
      animations: "disabled",
      timeout: SNAPSHOT_STABILIZATION_TIMEOUT_MS,
      mask: dynamicMaskLocators(page),
      maxDiffPixelRatio: 0.01,
    });
  });

  test("お問い合わせページ - full page snapshot", async ({ page }) => {
    await page.goto(urls.contact);
    await preparePageForVisualSnapshot(page, "お問い合わせ");

    await expect(page).toHaveScreenshot("contact.png", {
      fullPage: true,
      animations: "disabled",
      timeout: SNAPSHOT_STABILIZATION_TIMEOUT_MS,
      mask: dynamicMaskLocators(page),
      maxDiffPixelRatio: 0.01,
    });
  });
});

test.describe("Visual Regression - モバイル viewport", () => {
  test.skip(
    !VISUAL_ENABLED,
    "visual regression は PLAYWRIGHT_VISUAL=1 で有効化",
  );

  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await installHermeticNetwork(page);
  });

  test("ホームページ - モバイル full page", async ({ page }) => {
    await page.goto(urls.home);
    await preparePageForVisualSnapshot(page, /Where silence works\./);

    await expect(page).toHaveScreenshot("homepage-mobile.png", {
      fullPage: true,
      animations: "disabled",
      timeout: SNAPSHOT_STABILIZATION_TIMEOUT_MS,
      mask: [
        page.locator('[class*="announcement" i]'),
        page.locator("time, [datetime]"),
      ],
      maxDiffPixelRatio: 0.01,
    });
  });
});
