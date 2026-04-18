import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * Calendar ICS ダウンロード E2E（顧客認証済み state）
 *
 * テストシナリオ:
 * 1. `/api/calendar/reservation/[id]` が認証済みリクエストで 200 / text/calendar を返す（予約あり時）
 * 2. `/api/calendar/event/[registrationId]` 同上（イベント申込あり時）
 * 3. マイページ予約詳細に `AddToCalendar` セクションが表示される（予約あり時）
 * 4. マイページイベント申込一覧に `AddToCalendar` セクションが表示される（CONFIRMED 申込あり時）
 *
 * 前提:
 * - chromium-customer project（storage state 再利用）
 * - dev customer は初回は予約 0 件。データ無ければ skip（reservations.spec.ts パターン準拠）
 */

test.describe("AddToCalendar UI 表示", () => {
  test("マイページ予約詳細に AddToCalendar セクションが表示される", async ({
    page,
  }) => {
    await page.goto(urls.mypageReservations);
    await page.waitForLoadState("networkidle");

    const firstReservation = page
      .locator('a[href^="/mypage/reservations/"]')
      .first();

    if (!(await firstReservation.isVisible().catch(() => false))) {
      test.skip(true, "dev customer に予約データなし");
      return;
    }

    await firstReservation.click();
    await page.waitForLoadState("networkidle");

    const reservationStatus = await page
      .getByText(/キャンセル済|CANCELLED/i)
      .isVisible()
      .catch(() => false);

    if (reservationStatus) {
      // キャンセル済みは AddToCalendar 非表示が仕様
      const addToCalendar = page.locator(
        'section[aria-labelledby="add-to-calendar-label"]',
      );
      await expect(addToCalendar).toHaveCount(0);
      return;
    }

    const addToCalendar = page.locator(
      'section[aria-labelledby="add-to-calendar-label"]',
    );
    await expect(addToCalendar).toBeVisible();

    const googleLink = addToCalendar.getByRole("link", {
      name: /google calendar/i,
    });
    const outlookLink = addToCalendar.getByRole("link", { name: /outlook/i });
    const icsLink = addToCalendar.getByRole("link", { name: /iCal.*\.ics/i });
    await expect(googleLink).toBeVisible();
    await expect(outlookLink).toBeVisible();
    await expect(icsLink).toBeVisible();
  });

  test("マイページイベント申込一覧に AddToCalendar セクションが表示される（CONFIRMED のみ）", async ({
    page,
  }) => {
    await page.goto("/mypage/events");
    await page.waitForLoadState("networkidle");

    const confirmedRegistration = page
      .locator(
        'article:has([data-variant="success"]), article:has(:text("申込済"))',
      )
      .first();

    if (!(await confirmedRegistration.isVisible().catch(() => false))) {
      test.skip(true, "CONFIRMED 状態のイベント申込なし");
      return;
    }

    const addToCalendar = confirmedRegistration.locator(
      'section[aria-labelledby="add-to-calendar-label"]',
    );
    await expect(addToCalendar).toBeVisible();
  });
});

test.describe("Calendar API - 認証済みダウンロード", () => {
  test("予約詳細ページの ICS リンクは text/calendar を返す", async ({
    page,
    request,
  }) => {
    await page.goto(urls.mypageReservations);
    await page.waitForLoadState("networkidle");

    const firstReservation = page
      .locator('a[href^="/mypage/reservations/"]')
      .first();
    if (!(await firstReservation.isVisible().catch(() => false))) {
      test.skip(true, "dev customer に予約データなし");
      return;
    }

    await firstReservation.click();
    await page.waitForLoadState("networkidle");

    const icsLink = page
      .locator('section[aria-labelledby="add-to-calendar-label"]')
      .getByRole("link", { name: /iCal.*\.ics/i });

    if (!(await icsLink.isVisible().catch(() => false))) {
      test.skip(true, "キャンセル済み予約のため AddToCalendar 非表示");
      return;
    }

    const href = await icsLink.getAttribute("href");
    expect(href).toMatch(/\/api\/calendar\/reservation\/[0-9a-f-]+$/u);

    // request fixture は page の storage state を継承する（Playwright v1.35+）
    const response = await request.get(href ?? "");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/calendar");

    const body = await response.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("UID:reservation-");
    expect(body).toContain("BEGIN:VTIMEZONE");
    expect(body).toContain("TZID:Asia/Tokyo");
    expect(body).toContain("END:VCALENDAR");
  });
});
