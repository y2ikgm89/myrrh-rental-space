import { test, expect, type Locator, type Page } from "../../fixtures/e2e-test";
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
 * storageState 経由の IAP 模擬管理者）。
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
// mutation が一覧へ反映されるまでの待ち。CI workers:2 の並列実行下では
// audit log 書込（`src/shared/domain/audit-log/hash-chain-core.ts` の
// AUDIT_LOG_CHAIN_LOCK_KEY を使った pg_advisory_xact_lock によるグローバル直列化、
// 全 admin mutation 共通）や permission チェックを含む admin mutation の往復が
// 既定 5000ms を超えることがある。
//
// **判定に toast を使わない**。sonner の toast は
// 一定時間で自動的に消える一時 UI で、mutation の往復が伸びた回に取り逃す。実測:
// run 30635688437 で `getByText("料金プランを更新しました")` が 15s で
// `element(s) not found`。判定は**一覧に反映された永続状態**で行う（この spec は
// 元々その assertion を toast の直後に持っていたので、toast 待ちは冗長だった）。
const MUTATION_SETTLE_TIMEOUT = 15000;

/**
 * 料金設定タブをリロードしてから開き直す。
 *
 * mutation 後の `router.refresh()` が返す RSC ツリーだけを見ると、
 * 「その応答では新しいが、次の**新規リクエスト**では古い」ケース（cache tag の
 * 無効化漏れ）を素通ししてしまう。判定は必ず**リロード後の一覧**で行う。
 *
 * `expect.poll` で回さないのは、このフォームが楽観ロック（`expectedUpdatedAt`）を
 * 持たず、`invalidateSpaceRatePlansCache`（`updateTag`）が Server Action 内で
 * 同期的にタグを expire するため、リロードの時点で必ず最新が読めるから。
 * 競合による再試行が要るのは楽観ロックを持つ設定フォーム側の話。
 */
async function reloadPricingPanel(page: Page): Promise<Locator> {
  await page.reload();
  await page.getByRole("tab", { name: "料金設定" }).click();

  const panel = page.getByRole("tabpanel", { name: "料金設定" });
  await expect(
    panel.getByRole("heading", { level: 3, name: "料金プラン" }),
  ).toBeVisible({ timeout: ADMIN_ROUTE_TIMEOUT });
  return panel;
}

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

    await expect(createDialog).toBeHidden({
      timeout: MUTATION_SETTLE_TIMEOUT,
    });

    // 追加が**新規リクエストでも**見えることを確認する。
    const reloadedPanel = await reloadPricingPanel(page);
    const planRow = reloadedPanel.getByRole("row", {
      name: new RegExp(planName),
    });
    await expect(planRow).toBeVisible({ timeout: MUTATION_SETTLE_TIMEOUT });
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

    await expect(editDialog).toBeHidden({ timeout: MUTATION_SETTLE_TIMEOUT });

    const afterEditPanel = await reloadPricingPanel(page);
    await expect(
      afterEditPanel.getByRole("row", { name: new RegExp(planName) }),
    ).toContainText("¥1,500", { timeout: MUTATION_SETTLE_TIMEOUT });

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

    const afterDeletePanel = await reloadPricingPanel(page);
    await expect(
      afterDeletePanel.getByRole("row", { name: new RegExp(planName) }),
    ).toHaveCount(0, { timeout: MUTATION_SETTLE_TIMEOUT });
  });
});
