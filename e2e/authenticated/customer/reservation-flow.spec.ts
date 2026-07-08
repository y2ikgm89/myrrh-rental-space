import { test, expect, type BrowserContext } from "@playwright/test";
import { spaceFixtures, urls } from "../../fixtures";
import {
  customerReservationTargets,
  expectCustomerReservationListHas,
  openCustomerReservationDetail,
} from "./reservation-test-helpers";

/**
 * マイページ - 予約 full flow E2E（顧客認証済み state）
 *
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
 * - ゲスト（未認証）の予約 DB 書き込みは E2E 対象外。実際の予約作成は Stripe
 *   Checkout へのリダイレクトで終わるため（`stripe-payment.spec.ts` と同方針）、
 *   Server Action `createReservation` は `__tests__/integration/actions/public/reservation.test.ts`
 *   のモック統合テストで担保する
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

    await page.goto(
      `${urls.spaces}/${spaceFixtures.publicReservableSpaceSlug}`,
    );
    await expect(page).toHaveURL(
      new RegExp(`/spaces/${spaceFixtures.publicReservableSpaceSlug}$`, "u"),
    );

    const reserveButton = page.locator("#main-content").getByRole("link", {
      name: "Reserve this space",
    });
    await expect(reserveButton).toBeVisible({ timeout: 5000 });
    await reserveButton.click();

    await expect(page).toHaveURL(/\/reservation\?spaceId=[^&]+$/u, {
      timeout: 15000,
    });

    await expect(page.getByRole("group", { name: "日時選択" })).toBeVisible({
      timeout: 15000,
    });
  });
});

test.describe("予約 full flow - 履歴とキャンセル権限", () => {
  test("マイページ予約履歴で予約リストが表示される", async ({ page }) => {
    await page.goto(urls.mypageReservations);

    expect(page.url()).not.toMatch(/\/login/);
    expect(page.url()).toContain("/mypage");

    await expectCustomerReservationListHas(
      page,
      customerReservationTargets.confirmedUnpaid,
    );
    await expectCustomerReservationListHas(
      page,
      customerReservationTargets.pendingUnpaid,
    );
    await expectCustomerReservationListHas(
      page,
      customerReservationTargets.completedPaid,
    );
    await expectCustomerReservationListHas(
      page,
      customerReservationTargets.cancelledRefunded,
    );
  });

  test("認証済 customer は自身の予約詳細に直接アクセスできる", async ({
    page,
  }) => {
    await openCustomerReservationDetail(
      page,
      customerReservationTargets.confirmedUnpaid,
    );
    expect(page.url()).not.toMatch(/\/login/);
  });

  test("キャンセル可能な予約詳細ページにキャンセルボタンが見える", async ({
    page,
  }) => {
    await openCustomerReservationDetail(
      page,
      customerReservationTargets.pendingUnpaid,
    );

    await expect(
      page.getByRole("button", { name: "予約をキャンセルする" }),
    ).toBeVisible();
  });
});
