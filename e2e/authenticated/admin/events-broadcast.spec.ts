/**
 * Admin event broadcast composer (T12) smoke E2E
 *
 * 主に UI 表示 (件名 / 本文フィールド、対象人数、送信ボタン) の smoke と、
 * seed 由来 event の詳細から 一斉配信 リンクで遷移できることを確認する。
 * 実際のメール送信は Resend を叩かない。CI の E2E step は RESEND_API_KEY に
 * プレースホルダを入れるので transport 自体は有効だが、seed の Customer は
 * marketingOptIn が既定の false のままで getEventBroadcastPayload の recipients が
 * 0 件になり、sendEventBroadcast は fan-out する前に {ok:true, sent:0} を返す。
 * 宛先 0 件なので action の「宛先があるのに sent:0 なら失敗」判定には掛からず、
 * form reset が成立する。
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

  test("件名と本文を入力して送信すると成功 toast が表示される (配信対象 0 名なので sent:0 でも成功扱い)", async ({
    page,
  }) => {
    await openTimedEntryEventBroadcast(page);

    await page.getByLabel("件名").fill("E2E テスト配信");
    await page
      .getByLabel("本文")
      .fill("これは E2E テスト用の一斉配信本文です。");

    await page.getByRole("button", { name: "配信する" }).click();

    // 成功 toast (sonner)。上記のとおり配信対象が 0 件で sent:0 のまま成功扱いに
    // なる経路（宛先が 1 件以上あって sent:0 なら action はエラーを返す）。
    await expect(page.getByText("一斉配信メールを送信しました")).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
    // resetForm: true により件名 / 本文が空に戻る
    await expect(page.getByLabel("件名")).toHaveValue("");
    await expect(page.getByLabel("本文")).toHaveValue("");
  });
});
