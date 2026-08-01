import { test, expect, type Page } from "../fixtures/e2e-test";
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
 *   # 回帰検証（ローカル。CI 由来の *-linux.png とは描画が違うため差分は出る）
 *   PLAYWRIGHT_VISUAL=1 bunx playwright test e2e/visual
 *
 * ローカルで `--update-snapshots` を実行して commit しないこと（下記 baseline 管理）。
 *
 * 【設計原則】
 *
 * - 外部由来の描画ゆらぎを断つ（{@link installHermeticNetwork}）
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
 * hydration + lazy 画像の描画を待つには既定の expect timeout (5s) は短く、収束前に
 * 打ち切られると「ページ側は正常なのに fail」になる。2026-07-30 の full CI dispatch で
 * homepage が 4211 / 4404 / 4564px と揺れたのは、この収束途中で撮られたものと見ている。
 * CI runner の負荷差も吸収できるよう余裕を明示的に持たせる。
 */
const SNAPSHOT_STABILIZATION_TIMEOUT_MS = 20_000;

/**
 * 外部由来の描画ゆらぎを断つ。
 *
 * Cloudflare Turnstile の外部 iframe は読込タイミングでフォーム高さを動かすため
 * （2026-07-30 の full CI dispatch では contact が 2123 / 2024px と揺れた）、
 * 読ませない。visual の検証対象ではない。
 *
 * **画像は対象外**。seed の画像は全て `/images/seed/*.svg` のローカル SVG で、
 * `dangerouslyAllowSVG` 未設定のため Next は SVG を optimizer に通さず素で配信する
 * （next/dist/shared/lib/get-img-props.js:
 * `if (isDefaultLoader && !config.dangerouslyAllowSVG && src.endsWith('.svg')) unoptimized = true`）。
 * したがってこれらのページは `/_next/image` を一度も叩かず、外部画像取得も発生しない。
 * ここを route で差し替えても効果ゼロなので、実画像の回帰検出力を落とさないよう何もしない。
 */
const installHermeticNetwork = async (page: Page) => {
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
