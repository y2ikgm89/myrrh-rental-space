import { test, expect } from "@playwright/test";
import { ratePlanFixtures, spaceFixtures, urls } from "../../fixtures";

/**
 * 管理画面 - スペース料金プラン CRUD（Task 16）
 *
 * `セミナールーム`（`prisma/seed.ts` seedSpaces の `seminar-room`、
 * `spaceFixtures.adminRatePlanCrudTargetSlug` と同一スペース）の編集画面 →
 * 料金設定タブで、新規プラン追加 → 一覧反映確認 → 編集 → 保存確認 → 削除 →
 * 一覧から消えることまでを一連のフローで検証する。`seedSpaceRatePlans` は
 * 全 Space 共通で週末/祝日料金プランを作成するため、Task 15 の seed 由来プラン
 * （`ratePlanFixtures.weekendPlanName` / `holidayPlanName`）が既に一覧にあることも
 * 前提の健全性チェックとして確認する。
 *
 * Playwright project: chromium-admin（`e2e/authenticated/admin/*.spec.ts` →
 * storageState 経由の IAP 模擬管理者、`.claude/skills/e2e-authoring` 準拠）。
 * 単一 test 内で create → edit → delete を直列に行うため、他 test との共有状態や
 * 並列実行の順序依存はない（自己完結・自己後片付け）。
 *
 * Space 選定の理由（Task 16 follow-up fix、旧レビュー Finding 1 の根本対応）:
 * 公開予約フローの smoke spec（`e2e/smoke/rate-plan-preview.smoke.spec.ts`）は
 * `coworking-space` の `"use cache"` `cacheTag(SPACE_RATE_PLANS(spaceId))` を読む。
 * このタグは spaceId（DB 行の UUID）キーのため、この spec が別の Space
 * （seminar-room）を対象にする限り、create/update/delete が呼ぶ
 * `invalidateSpaceRatePlansCache`（`updateTag`）は構造的に別タグを無効化し、
 * smoke spec の読み取りとは競合しない。以前は両 spec が同一 coworking-space を
 * 対象にしており、CI `workers: 2` の並列実行下で smoke の価格アサーションが
 * 15〜30 秒超まで遅延する flake（8 回中 7 回再現）が発生していた
 * （`e2e/fixtures/test-data.ts` の `spaceFixtures.adminRatePlanCrudTargetSlug`
 * doc comment 参照）。
 */

const ADMIN_SPACE_NAME = "セミナールーム"; // seed の seminar-room.name（spaceFixtures.adminRatePlanCrudTargetSlug と対応）
const ADMIN_ROUTE_TIMEOUT = 20000;
// Server Action 完了後のトースト表示待ち。CI workers:2 の並列実行下では
// audit log 書込（`src/shared/domain/audit-log/hash-chain-core.ts` の
// AUDIT_LOG_CHAIN_LOCK_KEY を使った pg_advisory_xact_lock によるグローバル直列化、
// 全 admin mutation 共通）や permission チェックを含む admin mutation の往復が
// 既定 5000ms を超えることがある。この repo の他の admin spec（
// content-preview.spec.ts / google-business-profile.spec.ts /
// lexical-inline-icon.spec.ts の inlineEditor 等）も同種の post-mutation 待ちに
// 明示 timeout を使っており、15000ms が最も一般的な値（`.claude/skills/e2e-authoring`
// 準拠の repo 内 grep で確認済み）。この spec の 3 箇所のトーストアサーションのみが
// 既定値のままだったのが repo 内で唯一の例外だった。
const TOAST_TIMEOUT = 15000;

test.describe("管理画面 - スペース料金プラン CRUD", () => {
  test("新規プラン追加 → 編集 → 削除が一覧に反映される", async ({ page }) => {
    test.info().annotations.push({
      type: "seed-contract",
      description:
        `対象 Space slug: ${spaceFixtures.adminRatePlanCrudTargetSlug}` +
        "（coworking-space は rate-plan-preview.smoke.spec.ts 専用のため、" +
        "cache tag 分離のためこの spec では対象にしない。詳細はファイル冒頭コメント参照）",
    });

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
    // このスペース（seminar-room）は smoke spec が対象とする coworking-space とは
    // 別 Space（cache tag も別キー、ファイル冒頭コメント参照）のため、この制限は
    // cross-spec collision 回避としてはもはや必須ではない。ただし daysOfWeek 制限が
    // 実際に保存・表示されることを検証する追加カバレッジとして有用なため維持する
    // （下記の行内容アサーションで実証）。
    await createDialog
      .getByRole("checkbox", { name: "月", exact: true })
      .check();
    await createDialog
      .getByRole("button", { name: "追加", exact: true })
      .click();

    await expect(createDialog).not.toBeVisible();
    await expect(page.getByText("料金プランを追加しました")).toBeVisible({
      timeout: TOAST_TIMEOUT,
    });

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
    await expect(page.getByText("料金プランを更新しました")).toBeVisible({
      timeout: TOAST_TIMEOUT,
    });
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

    await expect(page.getByText("料金プランを削除しました")).toBeVisible({
      timeout: TOAST_TIMEOUT,
    });
    await expect(
      pricingPanel.getByRole("row", { name: new RegExp(planName) }),
    ).toHaveCount(0);
  });
});
