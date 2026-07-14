import { test, expect } from "@playwright/test";
import { ratePlanFixtures, urls } from "../../fixtures";

/**
 * 管理画面 - スペース料金プラン CRUD（Task 16）
 *
 * `コワーキングスペース`（`prisma/seed.ts` seedSpaces の `coworking-space`、
 * `spaceFixtures.publicReservableSpaceSlug` と同一スペース）の編集画面 → 料金設定
 * タブで、新規プラン追加 → 一覧反映確認 → 編集 → 保存確認 → 削除 → 一覧から消える
 * ことまでを一連のフローで検証する。Task 15 の seed 由来プラン
 * （`ratePlanFixtures.weekendPlanName` / `holidayPlanName`）が既に一覧にあることも
 * 前提の健全性チェックとして確認する。
 *
 * Playwright project: chromium-admin（`e2e/authenticated/admin/*.spec.ts` →
 * storageState 経由の IAP 模擬管理者、`.claude/skills/e2e-authoring` 準拠）。
 * 単一 test 内で create → edit → delete を直列に行うため、他 test との共有状態や
 * 並列実行の順序依存はない（自己完結・自己後片付け）。
 *
 * 作成する検証用プランは適用曜日を**月曜のみ**に限定する。このスペースは
 * `e2e/smoke/rate-plan-preview.smoke.spec.ts` が金/土/日の週末料金プラン反映を
 * 検証する対象と同一であり、`resolveRateBreakdown` は複数 plan 一致時に
 * `updatedAt` 最新のものを優先する（last-updated-wins）。適用曜日を未指定
 * （= 全曜日）のまま作成すると、このテストの生存期間中は smoke が対象とする
 * 金/土/日にも一致してしまい、`workers: 2` の CI で両 spec が並列実行された際に
 * smoke の ¥1,430 アサーションを壊し得る（レビュー Finding 1）。月曜のみに
 * 限定すれば smoke の対象曜日と論理的に絶対に重ならない。
 */

const ADMIN_SPACE_NAME = "コワーキングスペース"; // seed の coworking-space.name
const ADMIN_ROUTE_TIMEOUT = 20000;

test.describe("管理画面 - スペース料金プラン CRUD", () => {
  test("新規プラン追加 → 編集 → 削除が一覧に反映される", async ({ page }) => {
    await page.goto(urls.adminSpaces);

    await page
      .getByRole("link", { name: ADMIN_SPACE_NAME, exact: true })
      .click();

    await expect(page).toHaveURL(/\/admin\/spaces\/[^/]+\/edit$/u, {
      timeout: ADMIN_ROUTE_TIMEOUT,
    });

    await page.getByRole("tab", { name: "料金設定" }).click();

    const pricingPanel = page.getByRole("tabpanel", { name: "料金設定" });
    await expect(
      pricingPanel.getByRole("heading", { level: 3, name: "料金プラン" }),
    ).toBeVisible({ timeout: ADMIN_ROUTE_TIMEOUT });

    // seed 由来の週末/祝日料金プランが一覧に見える（前提の健全性チェック、Task 15）
    await expect(
      pricingPanel.getByRole("row", {
        name: new RegExp(ratePlanFixtures.weekendPlanName),
      }),
    ).toBeVisible();
    await expect(
      pricingPanel.getByRole("row", {
        name: new RegExp(ratePlanFixtures.holidayPlanName),
      }),
    ).toBeVisible();

    // --- Create ---
    const planName = `E2Eテストプラン${Date.now()}`;
    await pricingPanel.getByRole("button", { name: "新規プラン追加" }).click();

    const createDialog = page.getByRole("dialog", {
      name: "料金プランを追加",
    });
    await expect(createDialog).toBeVisible();
    await createDialog.getByLabel("プラン名 *").fill(planName);
    await createDialog.getByLabel("時間料金（円/時間）*").fill("1200");
    // 適用曜日を月曜のみに限定する（未選択のままだと defaults to 全曜日 = 空配列）。
    // このスペース（coworking-space）は e2e/smoke/rate-plan-preview.smoke.spec.ts が
    // 金/土/日で週末料金プラン（daysOfWeek: [FRIDAY,SATURDAY,SUNDAY]）の反映を検証する
    // 対象と同一で、resolveRateBreakdown は last-updated-wins のため、このテストが
    // 作成した「全曜日」プランは生存期間中 smoke の対象曜日にも一致してしまい、
    // CI workers:2 での並列実行時に smoke の ¥1,430 アサーションを壊し得る
    // （レビュー Finding 1）。月曜のみに限定すれば金/土/日と絶対に重ならない。
    await createDialog
      .getByRole("checkbox", { name: "月", exact: true })
      .check();
    await createDialog
      .getByRole("button", { name: "追加", exact: true })
      .click();

    await expect(createDialog).not.toBeVisible();
    await expect(page.getByText("料金プランを追加しました")).toBeVisible();

    const planRow = pricingPanel.getByRole("row", {
      name: new RegExp(planName),
    });
    await expect(planRow).toBeVisible();
    await expect(planRow).toContainText("¥1,200");
    // 上記の月曜限定チェックが実際に反映されたことの証拠（SpaceRatePlanList の
    // formatDaysOfWeek は daysOfWeek=["MONDAY"] を "月" 単体で表示する）。
    await expect(planRow).toContainText("月");

    // --- Edit ---
    await planRow
      .getByRole("button", { name: `${planName} を編集`, exact: true })
      .click();

    const editDialog = page.getByRole("dialog", { name: "料金プランを編集" });
    await expect(editDialog).toBeVisible();
    await editDialog.getByLabel("時間料金（円/時間）*").fill("1500");
    await editDialog.getByRole("button", { name: "更新", exact: true }).click();

    await expect(editDialog).not.toBeVisible();
    await expect(page.getByText("料金プランを更新しました")).toBeVisible();
    await expect(planRow).toContainText("¥1,500");

    // --- Delete ---
    await planRow
      .getByRole("button", { name: `${planName} を削除`, exact: true })
      .click();

    const confirmDialog = page.getByRole("alertdialog");
    await expect(confirmDialog).toBeVisible();
    await expect(confirmDialog).toContainText(planName);
    await confirmDialog
      .getByRole("button", { name: "削除", exact: true })
      .click();

    await expect(page.getByText("料金プランを削除しました")).toBeVisible();
    await expect(
      pricingPanel.getByRole("row", { name: new RegExp(planName) }),
    ).toHaveCount(0);
  });
});
