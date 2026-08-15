/**
 * Admin event broadcast composer (T12) smoke E2E
 *
 * 主に UI 表示 (件名 / 本文フィールド、対象人数、送信ボタン) の smoke と、
 * seed 由来 event の詳細から 一斉配信 リンクで遷移できることを確認する。
 * seed の Customer は marketingOptIn が既定の false のため、配信対象は 0 名で
 * BroadcastForm は送信ボタンを disabled にする。偽の成功 toast は期待しない。
 */

import { test, expect, type Page } from "../../fixtures/e2e-test";
import { urls } from "../../fixtures/test-data";

test.describe.configure({ mode: "serial" });

const ADMIN_EVENT_ROUTE_TIMEOUT = 20000;
const TIMED_ENTRY_EVENT_TITLE = "写真撮影ワークショップ";

async function openTimedEntryEventBroadcast(page: Page) {
  // 一覧は開始日時の降順 + 10 件/ページ。他 spec が実行中に作る E2E イベント
  // (waitlist / broadcast fixture 等) が 1 ページ目を埋め、seed 行は 2 ページ目へ
  // 押し出される (run 30569714860: 「1-10 / 全 12 件」)。タイトル検索でスコープする。
  await page.goto(
    `${urls.adminEvents}?search=${encodeURIComponent(TIMED_ENTRY_EVENT_TITLE)}`,
  );

  await page
    .getByRole("cell", {
      name: /写真撮影ワークショップ\s+日時選択制\s+\/photography-workshop/u,
    })
    .click();

  await expect(page).toHaveURL(/\/admin\/events\/[^/]+$/u, {
    timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
  });

  await page.getByRole("link", { name: "一斉配信" }).click();

  await expect(page).toHaveURL(/\/admin\/events\/[^/]+\/broadcast$/u, {
    timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
  });
}

test.describe("event broadcast composer (T12)", () => {
  test("イベント詳細から 一斉配信 リンクで compose UI に遷移する", async ({
    page,
  }) => {
    await openTimedEntryEventBroadcast(page);

    await expect(
      page.getByRole("heading", {
        name: `一斉配信: ${TIMED_ENTRY_EVENT_TITLE}`,
        level: 1,
      }),
    ).toBeVisible({ timeout: ADMIN_EVENT_ROUTE_TIMEOUT });
  });

  test("配信対象と配信対象外の人数が表示される", async ({ page }) => {
    await openTimedEntryEventBroadcast(page);

    await expect(page.getByTestId("broadcast-recipient-eligible")).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
    await expect(page.getByTestId("broadcast-recipient-skipped")).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
  });

  test("件名 / 本文 / 送信ボタンが表示される", async ({ page }) => {
    await openTimedEntryEventBroadcast(page);

    await expect(page.getByLabel("件名")).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
    await expect(page.getByLabel("本文")).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
    await expect(page.getByRole("button", { name: "配信する" })).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
  });

  test("配信対象が 0 名なら送信ボタンは無効", async ({ page }) => {
    await openTimedEntryEventBroadcast(page);

    await expect(page.getByTestId("broadcast-recipient-eligible")).toHaveText(
      "0",
      { timeout: ADMIN_EVENT_ROUTE_TIMEOUT },
    );
    await expect(page.getByRole("button", { name: "配信する" })).toBeDisabled();
  });
});
