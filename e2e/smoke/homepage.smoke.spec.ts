import { test, expect } from "../fixtures/e2e-test";
import { urls } from "../fixtures";
import {
  collectCspViolations,
  formatCspViolations,
} from "../helpers/csp-violations";
import { ensureAdminUser } from "../helpers/ensure-admin-user";

/**
 * Smoke: ホームページ
 *
 * 目的: 公開 root URL の基本到達性検証（< 30 秒）。
 * critical path: SSR / RSC 描画失敗で 500 / 白画面の即時検知。
 * 拡張テストは `e2e/public/homepage.spec.ts` 側で網羅、本 file はゲートのみ。
 */

const appSurface = process.env["APP_SURFACE"] ?? "admin";

test.describe("smoke: homepage", () => {
  test("ホームページが 200 OK で描画される", async ({ page }) => {
    const response = await page.goto(urls.home);
    expect(response?.status()).toBe(200);

    await expect(page.getByRole("main")).toBeVisible();
  });

  test("surface policy 通りのシェルが描画される", async ({ page }) => {
    await page.goto(urls.home);

    await expect(page.getByRole("banner")).toBeVisible();

    if (appSurface === "public") {
      await expect(page.getByRole("contentinfo")).toBeVisible();
      return;
    }

    await expect(page).toHaveURL(urls.adminDashboard);
    await expect(
      page.getByRole("heading", { name: "ダッシュボード" }),
    ).toBeVisible();
  });

  test("メタタイトルが設定されている", async ({ page }) => {
    await page.goto(urls.home);
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  /**
   * CSP 違反ゼロを surface ごとに検証する。
   *
   * 旧実装は「public surface の `/` だけ」「`msg.type() === "error"` のみ」で、
   * 実際に出ていた inline style の違反（`INFO:CONSOLE` レベル）を 1 件も拾えていなかった
   * （CI run 30606269265 で /contact・/events・/admin/reservations から 8 種類が
   * ブロックされていた）。route を代表的な複数ページに広げ、type 絞りも外す。
   *
   * admin surface では sonner が module 評価時に `<style>` を注入するため、
   * ページを開くだけで `style-src` の hash drift を検知できる。
   * Radix scroll lock（ダイアログ open 時に nonce 付き `<style>` を注入）は
   * `e2e/authenticated/admin/csp-inline-style.spec.ts` が担当する。
   */
  test("CSP violation が console に出ない", async ({ page }) => {
    if (appSurface === "admin") {
      // IAP 模擬の相手になる管理ユーザーが無いと access-denied に落ちる
      // （auth.smoke.spec.ts と同じ前提を張る）。
      await ensureAdminUser();
    }

    const routes =
      appSurface === "public"
        ? [urls.home, urls.contact, urls.events]
        : [urls.adminDashboard, urls.adminCustomers];

    const cspViolations = collectCspViolations(page);

    for (const route of routes) {
      await page.goto(route);
      await expect(page.getByRole("main")).toBeVisible();
      expect(
        cspViolations,
        `CSP violations after ${route}: ${formatCspViolations(cspViolations)}`,
      ).toEqual([]);
    }
  });
});
