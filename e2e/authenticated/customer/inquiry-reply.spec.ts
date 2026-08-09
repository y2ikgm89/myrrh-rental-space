import { test, expect } from "../../fixtures/e2e-test";
import { inquiryFixtures, urls } from "../../fixtures";
import { restoreDevCustomerResolvedInquiry } from "../../helpers/inquiry-fixture";

/**
 * マイページ - お問い合わせ返信 E2E（顧客認証済み state）
 *
 * シナリオ:
 * 1. seed の RESOLVED inquiry 詳細で STAFF 返信を確認
 * 2. 返信フォームから CUSTOMER 返信を送信
 * 3. スレッドに新しい CUSTOMER 返信が表示される
 *
 * 前提（seed-driven、`prisma/seed.ts` § seedDevCustomerAndReservations）:
 * - dev customer の RESOLVED inquiry に STAFF + seed CUSTOMER 返信が存在
 * - chromium-customer project（storage state 再利用）
 * - Turnstile は E2E bypass（`isE2ESecurityBypassAllowedFromHeaders`）
 *
 * DB 書き込みを伴うため describe を serial 化（並列 worker 衝突回避）。
 */

// 返信送信は `replyToInquiryAction` の冒頭で `formSubmitRateLimiter`
// （**5 リクエスト/分/IP**）を通る。client IP をテスト単位で配る前は顧客 spec が
// 全 spec と同一 IP を共有しており、他の公開フォーム spec と窓を奪い合って弾かれた。
// 実測 (run 30681869018): 返信フォームに `リクエストが多すぎます` が出たまま
// 3 attempt 全滅（リトライも同じ 1 分窓に入るので全部落ちる）。割当は
// `e2e/fixtures/e2e-test.ts` の fixture が担う。
test.describe.configure({ mode: "serial" });

// 顧客返信は seed fixture を 2 方向に壊す: marker 返信が append され（seed の
// `ensureInquiryReply` は本文一致の存在チェックなので消さない → run ごとに 1 件増え、
// 下の `postedReply` がいずれ strict mode violation になる）、status が
// RESOLVED → IN_PROGRESS へ reopen される（seed の inquiry 作成は「無ければ作る」
// だけで status を書き戻さないため「解決済」fixture が IN_PROGRESS で固定化する）。
// 復元は無条件に hook で行う。
// 規約同意 gate が作りうる `TermsAgreement` は append-only の証跡なので戻さない。
test.afterEach(async () => {
  await restoreDevCustomerResolvedInquiry();
});

test.describe("お問い合わせ返信 - 双方向スレッド", () => {
  test("STAFF 返信を確認し、CUSTOMER 返信を送信できる", async ({ page }) => {
    // terms reagree gate: dev customer に pending がある場合は先に同意を完了する
    await page.goto("/mypage/terms/reagree");
    const agreeAllButton = page.getByRole("button", {
      name: "すべてに同意する",
    });
    if (await agreeAllButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await page.locator('input[name="agreedTermsIds"]').first().check();
      // 全 checkbox をチェック（単一 doc の場合は1つだけ）
      const checkboxes = page.locator('input[name="agreedTermsIds"]');
      const count = await checkboxes.count();
      for (let i = 1; i < count; i++) {
        await checkboxes.nth(i).check();
      }
      await agreeAllButton.click();
      // redirect back to returnTo or mypage
      await expect(page).toHaveURL(/\/mypage/u, { timeout: 10000 });
    }

    await page.goto(urls.mypageInquiries);

    const main = page.getByRole("main");
    // [E2E] brackets are regex metacharacters — use text locator for exact match
    const detailLink = main.locator("a", {
      hasText: inquiryFixtures.devCustomerResolvedSubject,
    });
    await expect(detailLink).toBeVisible({ timeout: 10000 });
    await detailLink.click();

    await expect(page).toHaveURL(/\/mypage\/inquiries\/[^/]+$/u);

    await expect(
      main.getByText(inquiryFixtures.devCustomerResolvedStaffReply),
    ).toBeVisible();

    await expect(
      main.getByText(inquiryFixtures.devCustomerResolvedCustomerReply),
    ).toBeVisible();

    const replyBody = inquiryFixtures.e2eCustomerReplyMarker;
    await main.getByLabel("返信内容").fill(replyBody);
    await main.getByRole("button", { name: "返信を送信する" }).click();

    // `main.getByText(replyBody)` で待ってはいけない — **自分が fill した
    // textarea の中身にマッチして通ってしまう**ので、送信が失敗していても
    // 素通りする。実測 (run 30681869018): 返信は rate limit で弾かれ
    // `リクエストが多すぎます` が出ていたのに、この行は通過して次の行で初めて
    // 落ちた。待つ対象は最初から「投稿されたスレッド上の返信」にする。
    const postedReply = main
      .getByRole("article")
      .filter({ hasText: replyBody });
    await expect(postedReply).toBeVisible({ timeout: 15000 });
    await expect(
      postedReply.getByRole("heading", { name: "あなた" }),
    ).toBeVisible();
  });
});
