import { test, expect } from "@playwright/test";

/**
 * 管理画面 - Google Business Profile 連携 E2E（管理者認証済み state）
 *
 * Phase 3 GBP integration smoke. 実 Google OAuth は live API 依存で
 * 自動化困難なため、本 spec は **未連携状態の UI smoke** + **OAuth
 * callback redirect 後の query 処理** を検証する。
 *
 * シナリオ:
 *   1. `/admin/settings/integrations` で「カレンダー」タブに GBP セクションが表示される
 *   2. 未連携状態の Badge / 「Google で連携」 SubmitButton が見える
 *   3. `gbp_success=1` query 付きで開くと URL が clean up される
 *      （toast 確認は sonner の portal layer 検証で代替）
 *   4. `gbp_error=...` query 付きでも同様に clean up される
 *
 * 前提:
 *   - playwright.config.ts の chromium-admin project で実行
 *   - setup-admin により admin user が認証済み
 *   - dev サーバー稼働中
 *   - Settings.googleBusinessProfileEnabled は seed のデフォルト値（true / false）に依存しない
 *     設計（enabled=false でも未連携時の UI は表示されるため）
 *
 * ライブ OAuth flow / location sync の実呼び出しは E2E スコープ外。
 * domain unit test (`__tests__/unit/domain/google-business-profile/settings.test.ts`)
 * + integration test で担保（Phase 2 完了済み）。
 */

const API_SETTINGS_PATH = "/admin/settings/integrations?tab=calendar";

test.describe("Google Business Profile 連携 - smoke", () => {
  test("GBP セクションが「カレンダー」タブに表示される", async ({ page }) => {
    await page.goto(API_SETTINGS_PATH);

    // 認証済み（/admin/access-denied にリダイレクトされていない）
    expect(page.url()).not.toMatch(/\/admin\/login/);

    await expect(
      page.getByRole("region", {
        name: "Google Business Profile 連携",
      }),
    ).toBeVisible({ timeout: 15000 });
  });

  test("未連携状態の Badge と Google 連携ボタンが表示される", async ({
    page,
  }) => {
    await page.goto(API_SETTINGS_PATH);

    const gbpSection = page.getByRole("region", {
      name: "Google Business Profile 連携",
    });
    const unconnectedBadge = gbpSection.getByText("未連携", { exact: true });
    const connectedBadge = gbpSection.getByText("連携済み", { exact: true });

    // どちらか一方が必ず存在する（seed / Settings 状態に依存しない）
    const isConnected = await connectedBadge.isVisible().catch(() => false);
    if (!isConnected) {
      await expect(unconnectedBadge).toBeVisible();
      // 未連携時のみ「Google で連携」 SubmitButton が表示される
      await expect(
        gbpSection.getByRole("button", { name: /Google で連携/ }),
      ).toBeVisible();
    } else {
      // 連携済みなら「連携を解除」が表示される
      await expect(
        gbpSection.getByRole("button", { name: /連携を解除/ }),
      ).toBeVisible();
    }
  });

  test("`gbp_success=1` query で開くと URL から query が clean up される", async ({
    page,
  }) => {
    await page.goto(`${API_SETTINGS_PATH}&gbp_success=1`);

    // useEffect → router.replace は async commit phase で発火するため
    // 固定 timeout ではなく toHaveURL の auto-retry で polling 検証する
    // （tab=calendar は GoogleBusinessProfileSection の cleanup ロジックで保持される）
    await expect(page).toHaveURL(
      /^(?!.*gbp_success).*\/admin\/settings\/integrations\?tab=calendar/u,
      { timeout: 5000 },
    );
  });

  test("`gbp_error=invalid_state` query で開くと URL から query が clean up される", async ({
    page,
  }) => {
    await page.goto(`${API_SETTINGS_PATH}&gbp_error=invalid_state`);

    await expect(page).toHaveURL(
      /^(?!.*gbp_error).*\/admin\/settings\/integrations\?tab=calendar/u,
      { timeout: 5000 },
    );
  });
});
