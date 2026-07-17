/**
 * Admin event broadcast composer (T12) smoke E2E
 *
 * 主に UI 表示 (件名 / 本文フィールド、対象人数、送信ボタン) の smoke と、
 * seed 由来 event の詳細から 一斉配信 リンクで遷移できることを確認する。
 * 実際のメール送信は Resend を叩かず、成功 toast 表示までを見る (本番 API キーが
 * 無い E2E 環境では sendEmail は `{ok: false, reason: "disabled"}` の silent no-op
 * になり、sendEventBroadcast も ok:true / sent:0 で返るため form reset は成立する)。
 */

import { test, expect, type Page } from "@playwright/test";
import { urls } from "../../fixtures/test-data";

test.describe.configure({ mode: "serial" });

const ADMIN_EVENT_ROUTE_TIMEOUT = 20000;
const TIMED_ENTRY_EVENT_TITLE = "写真撮影ワークショップ";

async function openTimedEntryEventBroadcast(page: Page) {
  await page.goto(urls.adminEvents);

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

  test("件名と本文を入力して送信すると成功 toast が表示される (Resend disabled でも form は reset される)", async ({
    page,
  }) => {
    await openTimedEntryEventBroadcast(page);

    await page.getByLabel("件名").fill("E2E テスト配信");
    await page
      .getByLabel("本文")
      .fill("これは E2E テスト用の一斉配信本文です。");

    await page.getByRole("button", { name: "配信する" }).click();

    // 成功 toast (sonner) — Resend API キー未設定でも sendEventBroadcast は ok:true /
    // sent:0 で返るため form 側は success 経路を通る。
    await expect(page.getByText("一斉配信メールを送信しました")).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
    // resetForm: true により件名 / 本文が空に戻る
    await expect(page.getByLabel("件名")).toHaveValue("");
    await expect(page.getByLabel("本文")).toHaveValue("");
  });
});
