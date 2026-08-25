import { test, expect } from "../fixtures/e2e-test";
import { urls } from "../fixtures";
import "../fixtures/turnstile-stub";

/**
 * 公開サイト - 顧客認証 E2E テスト
 *
 * テストシナリオ:
 * 1. /login ページ表示
 * 2. ソーシャルログインボタン（Google / LINE）の表示
 * 3. ブランドロゴの表示と a11y 属性
 * 4. ヘッダー / フッター等の共通レイアウト
 *
 * 注意: 実際の OAuth callback は Google / LINE 側のフローのためテスト不可。
 *       本ファイルはログインページ UI と a11y 検証に集中する。
 *       認証済み状態のテストは integration で担保。
 */

test.describe("顧客ログインページ - UI と a11y", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(urls.customerLogin);
  });

  test("ログインページが正しく表示される", async ({ page }) => {
    // メインコンテンツが表示される
    const main = page.locator("main");
    await expect(main).toBeVisible();

    // ページタイトルが設定されている
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test("Google ログインボタンが表示される", async ({ page }) => {
    const googleButton = page.getByRole("button", {
      name: "Googleでログイン",
    });
    await expect(googleButton).toBeVisible();
  });

  test("LINE ログインボタンが表示される", async ({ page }) => {
    const lineButton = page.getByRole("button", {
      name: "LINEでログイン",
    });
    await expect(lineButton).toBeVisible();
  });

  test("noindex/nofollow メタタグが設定されている（クロール除外）", async ({
    page,
  }) => {
    const robotsMeta = page.locator('meta[name="robots"]');
    const robotsContent = await robotsMeta.getAttribute("content");

    expect(robotsContent).toBeTruthy();
    expect(robotsContent?.toLowerCase()).toContain("noindex");
    expect(robotsContent?.toLowerCase()).toContain("nofollow");
  });

  test("ログイン後の redirect 先パラメータを保持できる", async ({ page }) => {
    // /login?redirectTo=/mypage/reservations のような遷移経由
    await page.goto(`${urls.customerLogin}?redirectTo=/mypage`);

    // URL が保持されている
    expect(page.url()).toContain("redirectTo");

    // ログインボタンは引き続き表示
    const googleButton = page.getByRole("button", {
      name: "Googleでログイン",
    });
    await expect(googleButton).toBeVisible();
  });
});

/**
 * Turnstile が失効・失敗したときに送信を止める配線の検査。
 *
 * `social-login-buttons.tsx:151-152` は `onExpire` / `onError` の両方を
 * `setTurnstileToken("")` に配線しており、トークンが空になると `disabled`
 * （`:120-123`）が true に戻る。同じ配線は公開面の計 9 コンポーネントにある。
 *
 * この分岐は E2E で 1 度も走っていなかった。stub が成功経路しか作らず
 * `isExpired()` が定数 false だったため（`e2e/fixtures/turnstile-stub.ts`）。
 * 壊れ方が「緑のまま気づかない」向きなので、失敗経路を明示的に発火させる。
 *
 * driver の戻り値は発火した widget 数。0 でないことを先に確かめてから
 * ボタンの状態を見る — widget が 1 つも描画されていないのに緑になるのを防ぐ。
 */
test.describe("顧客ログインページ - Turnstile の失敗経路", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(urls.customerLogin);

    // 規約同意を満たし、残る無効化条件を Turnstile のトークンだけにする。
    // `locator.all()` は auto-wait しないので、先に 1 つ目の描画を待つ
    // （待たずに数えると、規約一覧が届く前のレンダーで 0 件を掴む）。
    const consents = page.getByRole("checkbox");
    await expect(consents.first()).toBeVisible();
    const consentCount = await consents.count();
    expect(consentCount).toBeGreaterThan(0);
    for (let index = 0; index < consentCount; index += 1) {
      await consents.nth(index).check();
    }
    await expect(
      page.getByRole("button", { name: "Googleでログイン" }),
    ).toBeEnabled();
  });

  test("トークンが失効すると送信ボタンが無効に戻る", async ({ page }) => {
    const expired = await page.evaluate(
      () => window.__turnstileStub?.expire() ?? 0,
    );
    expect(expired).toBeGreaterThan(0);

    await expect(
      page.getByRole("button", { name: "Googleでログイン" }),
    ).toBeDisabled();
  });

  test("Turnstile がエラーになると送信ボタンが無効に戻る", async ({ page }) => {
    const errored = await page.evaluate(
      () => window.__turnstileStub?.error() ?? 0,
    );
    expect(errored).toBeGreaterThan(0);

    await expect(
      page.getByRole("button", { name: "Googleでログイン" }),
    ).toBeDisabled();
  });
});
