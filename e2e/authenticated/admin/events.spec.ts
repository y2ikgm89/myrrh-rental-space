import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { urls } from "../../fixtures";

// Next dev compiles these admin event routes lazily. Keep this spec serial so
// cold route compilation is not raced by multiple workers against one server.
test.describe.configure({ mode: "serial" });

const ADMIN_EVENT_ROUTE_TIMEOUT = 20000;
const TIMED_ENTRY_EVENT_TITLE = "写真撮影ワークショップ";

async function openTimedEntryEventDetail(page: Page) {
  await page.goto(urls.adminEvents);

  await page
    .getByRole("cell", {
      name: /写真撮影ワークショップ\s+日時選択制\s+\/photography-workshop/u,
    })
    .click();

  await expect(page).toHaveURL(/\/admin\/events\/[^/]+$/u, {
    timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
  });
}

async function readDownload(downloadPath: string | null): Promise<Buffer> {
  if (!downloadPath) {
    throw new Error("download path missing");
  }
  return readFile(downloadPath);
}

/**
 * 管理画面 - イベント管理 E2E テスト
 *
 * テストシナリオ:
 * 1. イベント一覧ページの表示とフィルター
 * 2. イベント作成フォームへの遷移
 * 3. イベント詳細・編集画面
 * 4. 申込者一覧の表示
 * 5. ソート / ステータスフィルター
 *
 * 前提条件:
 * - DB に seed されたイベントデータ
 * - 管理者ユーザーが作成済み
 */

// =============================================================================
// セットアップ
// =============================================================================

// =============================================================================
// 1. イベント一覧ページ
// =============================================================================

test.describe("イベント管理 - 一覧ページ", () => {
  test("イベント管理ページが正しく表示される", async ({ page }) => {
    await page.goto(urls.adminEvents);

    await expect(
      page.getByRole("heading", { name: /イベント|Event/i, level: 1 }),
    ).toBeVisible({ timeout: ADMIN_EVENT_ROUTE_TIMEOUT });
  });

  test("新規作成ボタンが表示されている", async ({ page }) => {
    await page.goto(urls.adminEvents);

    const createButton = page.getByRole("link", { name: "新規作成" });
    await expect(createButton).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
  });

  test("seed 由来の単一開催・日時選択制イベントが表示される", async ({
    page,
  }) => {
    await page.goto(urls.adminEvents);

    const singleOccurrenceRow = page.getByRole("row", {
      name: /ヨガ＆マインドフルネス体験会 のイベントを編集/u,
    });
    const timedEntryRow = page.getByRole("row", {
      name: /写真撮影ワークショップ のイベントを編集/u,
    });
    await expect(singleOccurrenceRow).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
    await expect(timedEntryRow).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
    await expect(singleOccurrenceRow.getByText("単一開催")).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
    await expect(timedEntryRow.getByText("日時選択制")).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
  });
});

// =============================================================================
// 2. 新規作成画面
// =============================================================================

test.describe("イベント管理 - 新規作成", () => {
  test("新規作成ページに遷移できる", async ({ page }) => {
    await page.goto(urls.adminEvents);

    const createButton = page.getByRole("link", { name: "新規作成" });
    await createButton.click();

    await expect(page).toHaveURL(/\/admin\/events\/new$/u, {
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });

    await expect(page.locator("form#event-create")).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
  });

  test("必須フィールド（タイトル / 日時）の入力欄が存在する", async ({
    page,
  }) => {
    await page.goto("/admin/events/new");

    const eventCreateForm = page.locator("form#event-create");
    const titleInput = eventCreateForm.getByRole("textbox", {
      name: "タイトル",
      exact: true,
    });
    await expect(titleInput).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });

    // 開始日時 / 終了日時の入力欄
    const startTimeInput = page.getByLabel("開始日時");
    await expect(startTimeInput).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });

    const endTimeInput = page.getByLabel("終了日時");
    await expect(endTimeInput).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
  });

  test("開催方式を単一開催と日時選択制で切り替えられる", async ({ page }) => {
    await page.goto("/admin/events/new");

    const basicPanel = page.getByRole("tabpanel", { name: "基本情報" });

    await expect(basicPanel.getByText("開催方式")).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
    await expect(basicPanel.getByText("開催枠")).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
    await expect(
      page.getByRole("button", { name: "スロットを追加" }),
    ).toHaveCount(0);

    await page.getByRole("radio", { name: "日時選択制" }).click();

    await expect(basicPanel.getByText("スロット 1")).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
    await expect(basicPanel.getByText("スロット 2")).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
    await expect(
      page.getByRole("button", { name: "スロットを追加" }),
    ).toBeVisible();

    await page.getByRole("radio", { name: "単一開催" }).click();

    await expect(basicPanel.getByText("開催枠")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "スロットを追加" }),
    ).toHaveCount(0);
    await expect(basicPanel.getByText("スロット 2")).toHaveCount(0);
  });

  test("日時選択制の seed イベント詳細で開催方式と複数枠が見える", async ({
    page,
  }) => {
    await openTimedEntryEventDetail(page);

    const scheduleModeField = page
      .getByText("開催方式", { exact: true })
      .locator("..");
    await expect(
      scheduleModeField.getByText("日時選択制", { exact: true }),
    ).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });

    const timeSlotsField = page
      .getByText("タイムスロット", { exact: true })
      .locator("..");
    await expect(timeSlotsField.getByText(/定員\s*8人/u)).toHaveCount(2, {
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
  });

  test("イベント詳細で申込者の出欠状態を確認し CSV / Excel をダウンロードできる", async ({
    page,
  }) => {
    await openTimedEntryEventDetail(page);

    await expect(
      page.getByRole("heading", {
        name: TIMED_ENTRY_EVENT_TITLE,
        level: 1,
      }),
    ).toBeVisible({ timeout: ADMIN_EVENT_ROUTE_TIMEOUT });

    const registrationsTable = page.getByRole("table");
    await expect(
      registrationsTable.getByRole("columnheader", { name: "出欠" }),
    ).toBeVisible();
    await expect(
      registrationsTable.getByRole("row", { name: /田中太郎/u }),
    ).toContainText("未出席");
    await expect(
      registrationsTable.getByRole("row", { name: /鈴木一郎/u }),
    ).toContainText("-");

    const [csvDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "CSV" }).click(),
    ]);
    expect(csvDownload.suggestedFilename()).toMatch(
      /^event-registrations-\d{8}\.csv$/u,
    );
    const csv = (await readDownload(await csvDownload.path())).toString("utf8");
    expect(csv).toContain("氏名,メール,電話番号,参加人数,ステータス");
    expect(csv).toContain("出席日時");
    expect(csv).toContain("田中太郎");
    expect(csv).toContain("鈴木一郎");

    const [excelDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Excel" }).click(),
    ]);
    expect(excelDownload.suggestedFilename()).toMatch(
      /^event-registrations-\d{8}\.xlsx$/u,
    );
    const excelBuffer = await readDownload(await excelDownload.path());
    expect(excelBuffer.byteLength).toBeGreaterThan(0);
    expect(excelBuffer.subarray(0, 2).toString("utf8")).toBe("PK");
  });

  test("当日受付で出席トグルと quantity ベースの人数集計が実際に反映される", async ({
    page,
  }) => {
    await openTimedEntryEventDetail(page);
    await page.getByRole("link", { name: "出欠確認" }).click();

    await expect(page).toHaveURL(/\/admin\/events\/[^/]+\/check-in$/u, {
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });
    await expect(
      page.getByRole("heading", {
        name: `当日受付: ${TIMED_ENTRY_EVENT_TITLE}`,
        level: 1,
      }),
    ).toBeVisible({ timeout: ADMIN_EVENT_ROUTE_TIMEOUT });

    await expect(page.getByText(/0\s*\/\s*3\s*名チェック済/u)).toBeVisible();
    await expect(page.getByText(/申込\s*0\s*\/\s*2\s*件/u)).toBeVisible();

    await page.getByRole("button", { name: /田中太郎 の出席を記録/u }).click();
    await expect(page.getByText(/2\s*\/\s*3\s*名チェック済/u)).toBeVisible();
    await expect(page.getByText(/申込\s*1\s*\/\s*2\s*件/u)).toBeVisible();
    await expect(
      page.getByRole("button", { name: /田中太郎 の出席を取消/u }),
    ).toBeVisible();

    await page.getByRole("button", { name: /田中太郎 の出席を取消/u }).click();
    await expect(page.getByText(/0\s*\/\s*3\s*名チェック済/u)).toBeVisible();
    await expect(page.getByText(/申込\s*0\s*\/\s*2\s*件/u)).toBeVisible();
  });
});
