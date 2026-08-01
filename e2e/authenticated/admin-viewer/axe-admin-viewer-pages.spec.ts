import { test, expect } from "../../fixtures/e2e-test";
import { urls } from "../../fixtures";
import {
  buildAdminAxeScanner,
  formatAxeViolations,
  isBlockingAdminViolation,
} from "../../helpers/admin-axe";

/**
 * a11y scan - VIEWER role で管理画面を開く
 *
 * ## なぜ VIEWER 専用のスキャンが要るのか
 *
 * `axe-admin-pages.spec.ts` は SUPER_ADMIN で走る。SUPER_ADMIN は全 permission を
 * 持つため、**認可拒否の経路を一度も通らない**。
 *
 * 認可拒否が `<Suspense>` 境界の内側で起きると、Next.js は HTTP 3xx を返せず
 * meta タグによる client-side redirect に劣化する（公式仕様。redirect API
 * リファレンス「When used in a streaming context, this will insert a meta tag to
 * emit the redirect on the client side.」）。劣化した meta refresh は axe の
 * `meta-refresh` critical (WCAG 2.2.1 / 2.2.4) に当たる。
 *
 * この劣化は **permission を持たないロールでしか再現しない**。実際 CI run
 * 30577092619 では E2E identity がたまたま ADMIN ロールだったせいで監査ログページの
 * `meta-refresh` critical が露出し、identity を SUPER_ADMIN に直した #1683 以降は
 * テストから見えなくなった（が、実 EDITOR / VIEWER では今も起きる）。
 *
 * つまり本 spec は「認可拒否経路の a11y」を継続的に見張る唯一の gate であり、
 * `admin-page-auth-before-suspense.test.ts` の allowlist に残る 53 ページを
 * 1 件ずつ解消していく際の**実測側の検証手段**でもある。
 *
 * VIEWER identity は `chromium-admin-viewer` project が
 * `x-e2e-admin-identity: viewer` ヘッダーで供給する
 * （`src/shared/domain/admin-auth/e2e-identity.ts`）。
 */

/**
 * VIEWER が **アクセスできる** ルート。
 *
 * VIEWER の permission は `settings:read` と各種 `*:read`
 * （`src/shared/lib/admin-permissions.ts` の ROLE_PERMISSIONS）。
 * 描画される UI が SUPER_ADMIN と異なる（権限付きカードが消える等）ため、
 * VIEWER 視点の a11y は独立して見る価値がある。
 */
const VIEWER_AXE_ROUTES = [
  {
    label: "設定トップ（VIEWER は settings:read のみ）",
    path: urls.adminSettings,
  },
  { label: "ダッシュボード", path: urls.adminDashboard },
  {
    label: "顧客管理（VIEWER は customer:read を持つ）",
    path: urls.adminCustomers,
  },
] as const;

test.describe("a11y scan - VIEWER role の管理画面", () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  for (const route of VIEWER_AXE_ROUTES) {
    test(`${route.label}に critical/serious 違反がない`, async ({ page }) => {
      await page.goto(route.path);

      // 拒否時は /admin へ redirect されるため main の到達だけを待つ
      // （遷移先が変わっても a11y スキャン対象としては成立する）。
      await expect(page.getByRole("main")).toBeVisible({ timeout: 15000 });

      const results = await buildAdminAxeScanner(page).analyze();
      const blocking = results.violations.filter(isBlockingAdminViolation);

      expect(
        blocking,
        `${route.label} a11y violations:\n${formatAxeViolations(results.violations)}`,
      ).toEqual([]);
    });
  }
});

test.describe("認可拒否レスポンスは meta refresh を含まない", () => {
  /**
   * 権限不足は `denyAdminAccess()` = `notFound()` で **その場に** 404 境界を
   * 描画する（`_shared/queries/_helpers.ts`）。ナビゲーションが起きないので
   * meta タグ自体が出ない。
   *
   * 旧実装の `redirect("/admin")` は、`(dashboard)/layout.tsx` が `children` を
   * Suspense の内側に置いている（`DashboardChromeResolved` が `connection()` で
   * suspend する）ためストリーミング開始後に評価され、HTTP 3xx を返せず meta
   * タグに劣化していた。これは axe の `meta-refresh` critical (WCAG 2.2.1 / 2.2.4)。
   *
   * **ブラウザ遷移で検証しない**: 拒否レスポンスの shell は
   * `DashboardChromeSkeleton`（`<div aria-hidden>`、`main` を持たない）なので、
   * `main` の可視化を待つと（劣化が残っている場合に）遷移完了を待つことになり、
   * 検査対象が `/admin` にすり替わって違反を素通りする。
   * JS を実行しない `request` で生 HTML を直接見る。
   */
  test("VIEWER の監査ログ拒否は meta refresh に劣化しない", async ({
    request,
  }) => {
    // VIEWER は `auditLog:read` を持たない（SUPER_ADMIN 限定）ため必ず拒否経路を通る。
    const response = await request.get(urls.adminAuditLogs);
    const html = await response.text();

    expect(html).not.toMatch(/http-equiv=["']?refresh/iu);
  });
});
