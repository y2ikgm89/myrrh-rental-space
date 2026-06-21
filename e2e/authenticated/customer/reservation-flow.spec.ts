import { test, expect, type BrowserContext } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * マイページ - 予約 full flow E2E（顧客認証済み state）
 *
 * 既存の未認証 `e2e/reservation.spec.ts` と相補的に、
 * 認証済み customer が行う一連のライフサイクルを検証する:
 *
 * 1. スペース詳細から予約ページへ遷移
 * 2. 日時選択 → 利用者情報ステップ到達
 * 3. マイページ予約履歴 + 詳細直接アクセス
 *
 * 前提（seed-driven、`prisma/seed.ts` § seedDevCustomerAndReservations / seedSpaces 経由）:
 * - chromium-customer project（storage state 再利用、setup-customer 経由）
 * - 公開済み space が確実に 1 件以上
 * - dev customer に 4 件 reservation 確実に存在
 * - Turnstile は `context.route` で `**\/*turnstile*` を 200 に fulfill
 *
 * 注意:
 * - 実際の予約 DB 書き込みは未認証 `e2e/reservation.spec.ts` で網羅済み
 * - 本 spec は **認証 state 固有の挙動** (履歴反映 / 直接アクセス権限) に集中
 */

async function bypassTurnstile(context: BrowserContext): Promise<void> {
  await context.route("**/*turnstile*", (route) =>
    route.fulfill({ status: 200, body: "{}" }),
  );
  await context.route("**/challenges.cloudflare.com/**", (route) =>
    route.fulfill({ status: 200, body: "{}" }),
  );
}

test.describe("予約 full flow - スペース → 予約ページ遷移", () => {
  test("スペース詳細から予約ページへ遷移し、日時ステップが表示される", async ({
    page,
    context,
  }) => {
    await bypassTurnstile(context);

    await page.goto(urls.spaces);

    // seed-driven: 公開済 space が確実にある
    const spaceLink = page.locator('a[href*="/spaces/"]').first();
    await expect(spaceLink).toBeVisible({ timeout: 5000 });
    await spaceLink.click();

    // 「予約する」ボタン
    const reserveButton = page.getByRole("link", { name: /予約する/i }).first();
    await expect(reserveButton).toBeVisible({ timeout: 5000 });
    await reserveButton.click();

    expect(page.url()).toMatch(/\/reservation/);

    // 日時ステップ表示
    await expect(
      page.getByText(/日付を選択|日時選択|時間を選択/i).first(),
    ).toBeVisible();
  });
});

test.describe("予約 full flow - 履歴とキャンセル権限", () => {
  test("マイページ予約履歴で予約リストが表示される", async ({ page }) => {
    await page.goto(urls.mypageReservations);

    expect(page.url()).not.toMatch(/\/login/);
    expect(page.url()).toContain("/mypage/reservations");

    // seed-driven: 4 件確実に存在
    const detailLink = page.locator('a[href^="/mypage/reservations/"]').first();
    await expect(detailLink).toBeVisible({ timeout: 5000 });
  });

  test("認証済 customer は自身の予約詳細に直接アクセスできる", async ({
    page,
  }) => {
    await page.goto(urls.mypageReservations);

    const detailLink = page.locator('a[href^="/mypage/reservations/"]').first();
    await expect(detailLink).toBeVisible({ timeout: 5000 });

    const href = await detailLink.getAttribute("href");
    expect(href).toMatch(/^\/mypage\/reservations\/[^/]+$/);

    if (href) {
      await page.goto(href);
      expect(page.url()).not.toMatch(/\/login/);
      await expect(page.locator("main").first()).toBeVisible();
    }
  });

  test("予約詳細ページにキャンセルボタン or 期限切れ表示が見える", async ({
    page,
  }) => {
    await page.goto(urls.mypageReservations);

    const detailLink = page.locator('a[href^="/mypage/reservations/"]').first();
    await expect(detailLink).toBeVisible({ timeout: 5000 });
    await detailLink.click();

    // 一覧の最初がどの status / paymentStatus を持つかは sort 順に依存するため
    // どちらかが visible なら pass の契約とする。
    const cancelButton = page
      .getByRole("button", { name: /キャンセル/i })
      .first();
    const expiredNotice = page.getByText(/キャンセルできません|期限/i).first();

    const hasCancel = await cancelButton.isVisible().catch(() => false);
    const hasExpired = await expiredNotice.isVisible().catch(() => false);

    expect(hasCancel || hasExpired).toBeTruthy();
  });
});
