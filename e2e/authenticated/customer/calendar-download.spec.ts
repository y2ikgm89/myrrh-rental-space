import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * Calendar ICS ダウンロード E2E（顧客認証済み state）
 *
 * テストシナリオ:
 * 1. `/api/calendar/reservation/[id]` が認証済みリクエストで 200 / text/calendar を返す
 * 2. マイページ予約詳細に `AddToCalendar` セクションが表示される（非キャンセル予約）
 * 3. マイページイベント申込一覧の AddToCalendar 描画（seed に CONFIRMED 申込が無ければ smoke）
 *
 * 前提（seed-driven、`prisma/seed.ts` § seedDevCustomerAndReservations 経由）:
 * - dev customer に 4 件 reservation 確実に存在
 * - うち 2 件は非キャンセル状態（COMPLETED+PAID / CONFIRMED+UNPAID）
 * - イベント申込（EventRegistration）は seed なし — 該当 test は早期 return で smoke 完走
 */

test.describe("AddToCalendar UI 表示", () => {
  test("マイページ予約詳細に AddToCalendar セクションが表示される", async ({
    page,
  }) => {
    await page.goto(urls.mypageReservations);

    const firstReservation = page
      .locator('a[href^="/mypage/reservations/"]')
      .first();
    await expect(firstReservation).toBeVisible({ timeout: 5000 });
    await firstReservation.click();

    const reservationCancelled = await page
      .getByText(/キャンセル済|CANCELLED/i)
      .isVisible()
      .catch(() => false);

    const addToCalendar = page.locator(
      'section[aria-labelledby="add-to-calendar-label"]',
    );

    if (reservationCancelled) {
      // キャンセル済みは AddToCalendar 非表示が仕様（一覧 sort 順で最初の予約が CANCELLED の場合）
      await expect(addToCalendar).toHaveCount(0);
      return;
    }

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

  test("マイページイベント申込一覧の AddToCalendar 描画契約", async ({
    page,
  }) => {
    await page.goto("/mypage/events");

    // EventRegistration は seed にないため、ページ自体の描画ゲートのみ。
    // CONFIRMED 申込が seed に追加された時点で本 test を assertion 化する。
    await expect(page.locator("main").first()).toBeVisible();

    const confirmedRegistration = page
      .locator(
        'article:has([data-variant="success"]), article:has(:text("申込済"))',
      )
      .first();

    if (await confirmedRegistration.isVisible().catch(() => false)) {
      const addToCalendar = confirmedRegistration.locator(
        'section[aria-labelledby="add-to-calendar-label"]',
      );
      await expect(addToCalendar).toBeVisible();
    }
  });
});

test.describe("Calendar API - 認証済みダウンロード", () => {
  test("予約詳細ページの ICS リンクは text/calendar を返す", async ({
    page,
    request,
  }) => {
    await page.goto(urls.mypageReservations);

    const firstReservation = page
      .locator('a[href^="/mypage/reservations/"]')
      .first();
    await expect(firstReservation).toBeVisible({ timeout: 5000 });
    await firstReservation.click();

    const icsLink = page
      .locator('section[aria-labelledby="add-to-calendar-label"]')
      .getByRole("link", { name: /iCal.*\.ics/i });

    if (!(await icsLink.isVisible().catch(() => false))) {
      // キャンセル済み予約は AddToCalendar 非表示が仕様。本 test は HTTP 検証が目的のため
      // 該当の場合は detail 描画ゲートで完走（seed sort 順依存を spec 側で吸収）。
      await expect(page.locator("main").first()).toBeVisible();
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
