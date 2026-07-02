import { expect, type Page } from "@playwright/test";
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

export async function expectCustomerReservationListHas(
  page: Page,
  target: CustomerReservationTarget,
): Promise<void> {
  await page.goto(`${urls.mypageReservations}?tab=${target.tab}`);

  await expect(
    page.locator("#main-content").getByRole("link", {
      name: target.detailLinkName,
    }),
  ).toBeVisible({ timeout: 5000 });
}

export async function openCustomerReservationDetail(
  page: Page,
  target: CustomerReservationTarget,
): Promise<void> {
  await page.goto(`${urls.mypageReservations}?tab=${target.tab}`);

  const detailLink = page.locator("#main-content").getByRole("link", {
    name: target.detailLinkName,
  });
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
  return page.locator("#main-content").filter({
    has: page.getByRole("heading", { level: 1, name: "予約詳細" }),
  });
}

export function getReservationDetailHeader(page: Page, spaceName: string) {
  return getReservationDetailMain(page)
    .getByRole("heading", { level: 2, name: spaceName })
    .locator("..");
}
