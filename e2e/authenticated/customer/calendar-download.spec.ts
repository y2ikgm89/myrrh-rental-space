import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";
import {
  customerReservationTargets,
  openCustomerReservationDetail,
} from "./reservation-test-helpers";

/**
 * Calendar ICS ダウンロード E2E（顧客認証済み state）
 *
 * テストシナリオ:
 * 1. `/api/calendar/reservation/[id]` が認証済みリクエストで 200 / text/calendar を返す
 * 2. マイページ予約詳細に `AddToCalendar` セクションが表示される（非キャンセル予約）
 * 3. マイページイベント申込一覧の AddToCalendar 描画
 *
 * 前提（seed-driven、`prisma/seed.ts` § seedDevCustomerAndReservations 経由）:
 * - dev customer に 4 件 reservation 確実に存在
 * - うち 2 件は非キャンセル状態（COMPLETED+PAID / CONFIRMED+UNPAID）
 * - dev customer に CONFIRMED のイベント申込が 1 件存在
 */

test.describe("AddToCalendar UI 表示", () => {
  test("マイページ予約詳細に AddToCalendar セクションが表示される", async ({
    page,
  }) => {
    await openCustomerReservationDetail(
      page,
      customerReservationTargets.confirmedUnpaid,
    );

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

  test("マイページイベント申込一覧の AddToCalendar 描画契約", async ({
    page,
  }) => {
    await page.goto(urls.mypageEvents);

    await expect(
      page.getByRole("link", { name: /ヨガ＆マインドフルネス体験会/u }),
    ).toBeVisible();

    const registrationCard = page.getByRole("article", {
      name: /ヨガ＆マインドフルネス体験会.*申込済み/u,
    });
    await expect(registrationCard).toBeVisible();

    const addToCalendar = registrationCard.locator(
      'section[aria-labelledby="add-to-calendar-label"]',
    );
    await expect(addToCalendar).toBeVisible();
    await expect(
      addToCalendar.getByRole("link", { name: /google calendar/i }),
    ).toBeVisible();
    await expect(
      addToCalendar.getByRole("link", { name: /outlook/i }),
    ).toBeVisible();
    await expect(
      addToCalendar.getByRole("link", { name: /iCal.*\.ics/i }),
    ).toBeVisible();
  });
});

test.describe("Calendar API - 認証済みダウンロード", () => {
  test("予約詳細ページの ICS リンクは text/calendar を返す", async ({
    page,
    request,
  }) => {
    await openCustomerReservationDetail(
      page,
      customerReservationTargets.confirmedUnpaid,
    );

    const icsLink = page
      .locator('section[aria-labelledby="add-to-calendar-label"]')
      .getByRole("link", { name: /iCal.*\.ics/i });
    await expect(icsLink).toBeVisible();

    const href = await icsLink.getAttribute("href");
    expect(href).toMatch(/\/api\/calendar\/reservation\/[0-9a-f-]+$/u);

    // request fixture は page の storage state を継承する（Playwright v1.35+）
    const response = await request.get(href ?? "");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/calendar");

    const body = await response.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("UID:reservation-");
    expect(body).toMatch(/\bDTSTART:\d{8}T\d{6}Z\b/u);
    expect(body).toMatch(/\bDTEND:\d{8}T\d{6}Z\b/u);
    expect(body).not.toContain("BEGIN:VTIMEZONE");
    expect(body).not.toContain("TIMEZONE-ID:");
    expect(body).toContain("END:VCALENDAR");
  });

  test("イベント申込一覧の ICS リンクは text/calendar を返す", async ({
    page,
    request,
  }) => {
    await page.goto(urls.mypageEvents);

    await expect(
      page.getByRole("link", { name: /ヨガ＆マインドフルネス体験会/u }),
    ).toBeVisible();

    const registrationCard = page.getByRole("article", {
      name: /ヨガ＆マインドフルネス体験会.*申込済み/u,
    });
    await expect(registrationCard).toBeVisible();

    const icsLink = registrationCard
      .locator('section[aria-labelledby="add-to-calendar-label"]')
      .getByRole("link", { name: /iCal.*\.ics/i });
    await expect(icsLink).toBeVisible();

    const href = await icsLink.getAttribute("href");
    expect(href).toMatch(/\/api\/calendar\/event\/[^/?#]+$/u);

    const response = await request.get(href ?? "");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/calendar");

    const body = await response.text();
    expect(body).toContain("BEGIN:VCALENDAR");
    expect(body).toContain("UID:event-registration-");
    expect(body).toContain("METHOD:REQUEST");
    expect(body).toMatch(/\bDTSTART:\d{8}T\d{6}Z\b/u);
    expect(body).toMatch(/\bDTEND:\d{8}T\d{6}Z\b/u);
    expect(body).not.toContain("TIMEZONE-ID:");
    expect(body).toContain("END:VCALENDAR");
  });
});
