import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";

/**
 * 管理画面 — 顧客匿名化 E2E (Phase 7 PR11)
 *
 * fixture で作成した未紐付け顧客を admin 詳細から匿名化し、
 * 一覧検索で placeholder email に置換されることを検証する。
 */

const execFileAsync = promisify(execFile);
const workspaceRoot = path.join(__dirname, "..", "..", "..");
const ADMIN_CUSTOMERS_PATH = "/admin/customers";

interface AnonymizeCustomerFixture {
  readonly customerId: string;
  readonly displayName: string;
  readonly email: string;
}

async function createAnonymizeCustomerFixture(): Promise<AnonymizeCustomerFixture> {
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "create-anonymize-customer-fixture.ts",
  );
  const { stdout } = await execFileAsync("bun", [scriptPath], {
    cwd: workspaceRoot,
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as AnonymizeCustomerFixture;
}

test.describe("admin 顧客 — 匿名化", () => {
  test("顧客詳細から匿名化すると PII が placeholder に置換される", async ({
    page,
  }) => {
    const fixture = await createAnonymizeCustomerFixture();

    await page.goto(
      `${ADMIN_CUSTOMERS_PATH}?search=${encodeURIComponent(fixture.email)}`,
    );

    const row = page.getByRole("row", {
      name: `${fixture.displayName} の顧客情報を表示`,
    });
    await expect(row).toBeVisible({ timeout: 15000 });
    await row.focus();
    await row.press("Enter");
    await expect(page).toHaveURL(/\/admin\/customers\/[0-9a-f-]+(?:\?|$)/u, {
      timeout: 10000,
    });

    await page.getByRole("button", { name: "匿名化" }).click();
    // 匿名化確認は AlertDialog（Radix が role="alertdialog" を出力する）。
    // ARIA の alertdialog は dialog を継承しないため `getByRole("dialog")` では
    // 一致しない（run 30569714860 でこの spec が「element not found」で落ちていた）。
    await expect(
      page
        .getByRole("alertdialog")
        .getByText(`${fixture.displayName} を匿名化しますか？`),
    ).toBeVisible();
    await page.getByRole("button", { name: "匿名化する" }).click();

    await expect(page).toHaveURL(/\/admin\/customers(?:\?|$)/u, {
      timeout: 15000,
    });

    await page.goto(
      `${ADMIN_CUSTOMERS_PATH}?search=${encodeURIComponent(fixture.email)}`,
    );
    await expect(
      page.getByRole("row", {
        name: `${fixture.displayName} の顧客情報を表示`,
      }),
    ).toHaveCount(0);

    // 匿名化は lastName / firstName を含む PII を **null 化**する
    // (`ANONYMIZED_CUSTOMER_FIELDS`)。行の accessible name は元の氏名から作られる
    // ので、匿名化後に元の氏名で行を探すのは契約と矛盾する
    // （run 30595374008 の失敗）。placeholder email が残っていること自体を確認し、
    // 元の氏名がもうどこにも出ないことを併せて検証する。
    const anonymizedEmail = `deleted+${fixture.customerId}@anonymized.local`;
    await page.goto(
      `${ADMIN_CUSTOMERS_PATH}?search=${encodeURIComponent(anonymizedEmail)}`,
    );
    await expect(page.getByText(anonymizedEmail)).toBeVisible({
      timeout: 15000,
    });
    await expect(page.getByText(fixture.displayName)).toHaveCount(0);
  });
});
