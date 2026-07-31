import { test, expect } from "@playwright/test";
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

    const row = page.getByRole("row", {
      name: new RegExp(inquiryFixtures.generalInProgressAssigneeSubject, "u"),
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

    await expect(
      page.getByRole("row", {
        name: new RegExp(inquiryFixtures.devCustomerNewSubject, "u"),
      }),
    ).toBeVisible({ timeout: 15000 });
  });
});
