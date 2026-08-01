import { test, expect } from "../../fixtures/e2e-test";
import { inquiryFixtures, urls } from "../../fixtures";

/**
 * 管理画面 — inquiry operational fixtures smoke (Phase 7 PR7)
 *
 * `e2e/fixtures/test-data.ts` の `inquiryFixtures` が seed
 * (`seedInquiryOperationalFixtures` / dev customer inquiries) と同期していることを
 * end-to-end で検知する drift gate。
 */

const ADMIN_INQUIRIES_PATH = urls.adminInquiries;

test.describe("admin お問い合わせ — operational fixture 契約", () => {
  test("seed の operational subject / tag が一覧に表示される", async ({
    page,
  }) => {
    await page.goto(
      `${ADMIN_INQUIRIES_PATH}?search=${encodeURIComponent(inquiryFixtures.generalInProgressAssigneeSubject)}`,
    );

    await expect(
      page.getByRole("heading", { name: "お問い合わせ管理" }),
    ).toBeVisible({
      timeout: 15000,
    });

    // 行の accessible name は `<件名> の詳細を表示`。fixture 文字列を
    // `new RegExp()` に流すと正規表現メタ文字がそのまま解釈されるため
    // （`[E2E]` が文字クラスになる実害あり。下のテスト参照）、完全一致で指定する。
    const row = page.getByRole("row", {
      name: `${inquiryFixtures.generalInProgressAssigneeSubject} の詳細を表示`,
    });
    await expect(row).toBeVisible({ timeout: 15000 });
    // fixture の tag 名（「対応中」）はステータスラベルと同じ文字列のため、行全体で
    // テキスト検索すると タグ列 と ステータス列 の 2 件に一致する
    // （run 30569714860 の strict mode violation）。タグ列のリストへ明示的に絞る。
    await expect(
      row
        .getByRole("list", { name: "タグ" })
        .getByText(inquiryFixtures.tagInProgress),
    ).toBeVisible();
  });

  test("dev customer の seed inquiry subject が検索で見つかる", async ({
    page,
  }) => {
    await page.goto(
      `${ADMIN_INQUIRIES_PATH}?search=${encodeURIComponent(inquiryFixtures.devCustomerNewSubject)}`,
    );

    // `new RegExp("[E2E] dev customer の新規お問い合わせ", "u")` は `[E2E]` が
    // 文字クラスとして解釈され、実際の accessible name に**一致しない**
    // （run 30569714860 / 30595374008 で 2 回とも「行はあるのに not found」だった）。
    await expect(
      page.getByRole("row", {
        name: `${inquiryFixtures.devCustomerNewSubject} の詳細を表示`,
      }),
    ).toBeVisible({ timeout: 15000 });
  });
});
