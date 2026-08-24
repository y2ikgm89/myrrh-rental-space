import { test, expect } from "../fixtures/e2e-test";
import {
  buildPublicAxeScanner,
  formatAxeViolations,
  isBlockingPublicViolation,
} from "../helpers/public-axe";
import {
  eventFixtures,
  publicDetailFixtures,
  spaceFixtures,
  urls,
} from "../fixtures";

/**
 * 走査対象。一覧だけでなく**詳細ページも入れる**。
 *
 * 詳細ページにしか出ないコンポーネントがいくつもある（記事内目次・イベント
 * カレンダーの開閉・スペース詳細のサイドバー等）。一覧だけを見ていた頃、
 * 記事内目次の見出しリンクが AA を割っているのを axe は 1 度も指摘できなかった
 * （PR #2616 で人手で見つけた）。代表 1 件ずつでよい — 同じ型のページは同じ
 * コンポーネント木を通るので、slug を増やしても検出力は上がらず時間だけ増える。
 *
 * slug は `e2e/fixtures/test-data.ts` が SSoT（spec に直書きしない）。
 */
const PUBLIC_AXE_ROUTES = [
  { path: urls.home, label: "ホームページ" },
  { path: urls.about, label: "会社概要ページ" },
  { path: urls.access, label: "アクセスページ" },
  { path: urls.spaces, label: "スペース一覧ページ" },
  {
    path: `${urls.spaces}/${spaceFixtures.publicReservableSpaceSlug}`,
    label: "スペース詳細ページ",
  },
  { path: urls.reservation, label: "予約ページ" },
  { path: urls.blog, label: "ブログ一覧ページ" },
  {
    path: `${urls.blog}/${publicDetailFixtures.postSlug}`,
    label: "ブログ記事ページ",
  },
  { path: urls.news, label: "お知らせ一覧ページ" },
  {
    path: `${urls.news}/${publicDetailFixtures.newsSlug}`,
    label: "お知らせ詳細ページ",
  },
  { path: urls.contact, label: "お問い合わせページ" },
  { path: urls.faq, label: "FAQ ページ" },
  { path: urls.events, label: "イベント一覧ページ" },
  {
    path: `${urls.events}/${eventFixtures.singleOccurrenceSlug}`,
    label: "イベント詳細ページ",
  },
  { path: urls.terms, label: "規約一覧ページ" },
  {
    path: `${urls.terms}/${publicDetailFixtures.termsSlug}`,
    label: "規約詳細ページ",
  },
  { path: urls.customerLogin, label: "ログインページ" },
] as const;

/**
 * 公開ページ - axe-core 自動アクセシビリティスキャン
 *
 * WCAG 2.1 AA 準拠を自動検証する。
 *
 * 【設計原則】
 * scanner の設定と blocking 判定は `e2e/helpers/public-axe.ts` が SSoT
 * （予約ウィザードの spec と共有する）。
 *
 * 参照:
 * - https://github.com/dequelabs/axe-core/blob/develop/doc/API.md
 * - WCAG 2.1 AA: https://www.w3.org/TR/WCAG21/
 */

const appSurface = process.env["APP_SURFACE"] ?? "admin";

test.describe("a11y scan - 公開ページ主要ルート", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const route of PUBLIC_AXE_ROUTES) {
    test(`${route.label}に critical/serious 違反がない`, async ({ page }) => {
      if (route.path === urls.home) {
        test.skip(
          appSurface !== "public",
          "Public homepage root is served only on public surface.",
        );
      }

      await page.goto(route.path);
      await expect(page.getByRole("main")).toBeVisible();

      const results = await buildPublicAxeScanner(page).analyze();
      const blocking = results.violations.filter(isBlockingPublicViolation);

      expect(
        blocking,
        `${route.label} a11y violations:\n${formatAxeViolations(results.violations)}`,
      ).toEqual([]);
    });
  }
});
