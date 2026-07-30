import { test, expect } from "@playwright/test";
import {
  ensureGuestCustomerForDevEmail,
  issueCustomerMergeTokenForE2E,
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
    await expect(page.getByText("統合対象の履歴（概算）")).toBeVisible();
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
    await expect(page.getByText("統合対象の履歴")).toBeVisible();

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
