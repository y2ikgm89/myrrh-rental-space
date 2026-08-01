import { test, expect } from "@playwright/test";
import { visibleByText } from "../../helpers/streaming-safe-locators";
import {
  ensureGuestCustomerForDevEmail,
  issueCustomerMergeTokenForE2E,
  restoreGuestCustomerFixture,
} from "../../helpers/customer-merge-fixture";

/**
 * Self-serve customer merge E2E
 *
 * 1. mypage banner に「自分で統合する」が表示される
 * 2. request ページから確認メール送信 UI が動作する
 * 3. confirm ページで merge 完了（seed 済 guest + helper 発行 token）
 */

test.describe.configure({ mode: "serial" });

test.describe("customer merge — self-serve flow", () => {
  // 3 番目のテストが merge を実行してゲスト行を消費するため、serial retry で
  // beforeAll が再実行されたときに「存在チェック」だけだと必ず落ちる。
  // 消費されていれば作り直す（冪等）。
  test.beforeAll(async () => {
    await ensureGuestCustomerForDevEmail();
  });

  // merge は guest Customer を物理削除し、その予約を dev member customer へ
  // 付け替える。戻さないと (1) mypage の統合バナーが他 spec から消えたまま、
  // (2) seed が marker 予約を作り直して dev customer の予約履歴が run ごとに
  // 1 件ずつ増え続ける。beforeAll の冪等化だけでは (2) は戻らないため、
  // 復元は無条件に hook で行う（規約: `.claude/rules/testing-e2e.md`）。
  test.afterEach(async () => {
    await restoreGuestCustomerFixture();
  });

  test("banner shows self-serve merge CTA", async ({ page }) => {
    await page.goto("/mypage");
    const banner = page.getByRole("status");
    await expect(
      banner.getByRole("link", { name: "自分で統合する" }),
    ).toBeVisible({
      timeout: 10000,
    });
  });

  test("request page renders preview and send button", async ({ page }) => {
    await page.goto("/mypage/merge/request");
    await expect(
      page.getByRole("heading", { name: "履歴の統合" }),
    ).toBeVisible();
    // `getByText` は React streaming の hidden staging copy にも一致し
    // strict-mode violation になる（CI run 30621350538）。この `<p>` は role も
    // id も持たないため `visibleByText` で表示中の 1 本に絞る
    // （規約: `.claude/rules/testing-e2e.md`「id セレクタ禁止」）。
    await expect(visibleByText(page, "統合対象の履歴（概算）")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "確認メールを送信" }),
    ).toBeVisible();
  });

  test("confirm page completes merge with valid token", async ({ page }) => {
    const { rawToken } = await issueCustomerMergeTokenForE2E();
    await page.goto(
      `/mypage/merge/confirm?token=${encodeURIComponent(rawToken)}`,
    );

    await expect(
      page.getByRole("heading", { name: "履歴統合の最終確認" }),
    ).toBeVisible();
    // request ページ側と同じ理由。confirm ページの `<p>` も role / id を持たないので
    // `visibleByText` で表示中の 1 本に絞る。実測: run 30670065962 で
    // `getByText('統合対象の履歴') resolved to 2 elements`（片方は staging copy）。
    await expect(visibleByText(page, "統合対象の履歴")).toBeVisible();

    await page.getByRole("button", { name: "統合する" }).click();
    await expect(page).toHaveURL(/\/mypage/u, { timeout: 15000 });
    // `getByRole("status")` は merge banner と AriaLiveProvider の sr-only live region の
    // 2 件に一致して strict mode violation になる。統合完了の実観測点は
    // 「自分で統合する」CTA が消えることなので、その要素自体を数える。
    await expect(
      page.getByRole("link", { name: "自分で統合する" }),
    ).toHaveCount(0, { timeout: 10000 });
  });
});
