import { expect, type Page } from "../../fixtures/e2e-test";
import { urls } from "../../fixtures";

type ReservationListTab = "active" | "past";

export const customerReservationTargets = {
  pendingUnpaid: {
    tab: "active",
    detailLinkName: /保留中.*未払い.*詳細を見る/u,
  },
  confirmedUnpaid: {
    tab: "active",
    detailLinkName: /確認済み.*未払い.*詳細を見る/u,
  },
  completedPaid: {
    tab: "past",
    detailLinkName: /ミーティングルーム A.*完了.*支払い済み.*詳細を見る/u,
  },
  cancelledRefunded: {
    tab: "past",
    detailLinkName: /キャンセル.*返金済み.*詳細を見る/u,
  },
} as const satisfies Record<
  string,
  {
    readonly tab: ReservationListTab;
    readonly detailLinkName: RegExp;
  }
>;

export type CustomerReservationTarget =
  (typeof customerReservationTargets)[keyof typeof customerReservationTargets];

/**
 * 予約履歴から対象ステータスの「詳細を見る」リンクを 1 件に絞る。
 *
 * dev customer の予約は seed の 4 件（status × paymentStatus のカバレッジ）だけでは
 * ない。`seedRecurringReservationSeriesFixture`（PR #1165）が WEEKLY COUNT=3 の
 * series instance を **CONFIRMED / UNPAID** で 3 件足すほか、他の spec が実行中に
 * 予約を作る。そのため status ベースの正規表現は必ず複数一致し得る
 * （strict mode violation で 11 件が失敗していた: run 30569714860）。
 *
 * これらの spec は「特定の 1 予約」ではなく「そのステータスの予約詳細で UI が
 * 成立すること」を検証するので、先頭の一致を対象にすれば十分かつ安定する。
 * 特定の予約を指す必要が出た場合は fixture 側に識別子を持たせること。
 */
function reservationDetailLink(page: Page, target: CustomerReservationTarget) {
  return page
    .getByRole("main")
    .getByRole("link", { name: target.detailLinkName })
    .first();
}

export async function expectCustomerReservationListHas(
  page: Page,
  target: CustomerReservationTarget,
): Promise<void> {
  await page.goto(`${urls.mypageReservations}?tab=${target.tab}`);

  await expect(reservationDetailLink(page, target)).toBeVisible({
    timeout: 5000,
  });
}

export async function openCustomerReservationDetail(
  page: Page,
  target: CustomerReservationTarget,
): Promise<void> {
  await page.goto(`${urls.mypageReservations}?tab=${target.tab}`);

  const detailLink = reservationDetailLink(page, target);
  await expect(detailLink).toBeVisible({ timeout: 5000 });

  const href = await detailLink.getAttribute("href");
  expect(href).toMatch(/^\/mypage\/reservations\/[^/]+$/u);

  await detailLink.click();
  await expect(page).toHaveURL(/\/mypage\/reservations\/[^/]+$/u);
  await expectReservationDetailHeading(page);
}

export async function expectReservationDetailHeading(
  page: Page,
): Promise<void> {
  await expect(
    getReservationDetailMain(page).getByRole("heading", {
      level: 1,
      name: "予約詳細",
    }),
  ).toBeVisible({ timeout: 5000 });
}

export function getReservationDetailMain(page: Page) {
  return page.getByRole("main").filter({
    has: page.getByRole("heading", { level: 1, name: "予約詳細" }),
  });
}

export function getReservationDetailHeader(page: Page, spaceName: string) {
  return getReservationDetailMain(page)
    .getByRole("heading", { level: 2, name: spaceName })
    .locator("..");
}
