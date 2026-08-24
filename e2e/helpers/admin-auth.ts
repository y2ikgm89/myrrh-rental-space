import { expect, type Page } from "../fixtures/e2e-test";
import { urls } from "../fixtures";
import { ensureAdminUser } from "./ensure-admin-user";

/**
 * 管理画面にサインイン済みの状態を作る（IAP 模擬）。
 *
 * client IP の割当はここでは行わない。`e2e/fixtures/e2e-test.ts` の
 * `extraHTTPHeaders` fixture がテスト単位で配るため、fixture 由来の context は
 * この関数を呼ぶ前から一意な IP を持っている。`browser.newContext()` で
 * 手動生成した context だけが `primeE2EContext(context)` を必要とする。
 */
export async function signInAsAdmin(page: Page): Promise<void> {
  await ensureAdminUser();
  await page.goto(urls.adminDashboard);
  await expect(page).toHaveURL(urls.adminDashboard, { timeout: 15000 });
  await expect(page.getByRole("main")).toBeVisible();
}
