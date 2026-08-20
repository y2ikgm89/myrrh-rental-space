import { test, expect } from "../../fixtures/e2e-test";
import { urls } from "../../fixtures";

/**
 * 管理画面 - ダイアログ内で開いた Select が前面に出ること
 *
 * ## なぜこの spec があるか
 *
 * Radix の Dialog も Select も `document.body` 直下へ Portal されるので、両者は
 * 同じ root stacking context の兄弟になる。かつて admin の z-index トークンは
 * ページ内の序列（dropdown 25 < dialog 90）をそのまま Portal 先にも適用しており、
 * **ダイアログ内で開いた Select が必ずダイアログの背後に沈んでいた**
 * （2026-08-19、設定 > 外部連携 > SwitchBot のデバイス編集「機種」で報告）。
 *
 * この欠陥は unit では捕まらない。z-index は解決済みの数値としてなら比較できるが、
 * 「実際に重なって触れなくなる」は合成した DOM では再現しない。そして E2E 側は
 * **ページ上の Select しか通っておらず、ダイアログ内の Select は 1 本も無かった**。
 * だから本番の管理画面で見つかるまで生き残った。ここで実ブラウザに判定させる。
 *
 * Playwright の `click()` は actionability check に「receives pointer events」を
 * 含むので、option がダイアログ／overlay に覆われていれば
 * "intercepts pointer events" で落ちる。**その挙動自体が assertion**。
 *
 * ## 状態を残さない
 *
 * 選択はクライアント state を変えるだけで、保存せず Escape で閉じる。seed の
 * `[E2E] テストキーパッド`（`prisma/seed.ts` の `KEYPAD_TOUCH` 固定、
 * `reservation-passcode-reveal.spec.ts` が同じ行に依存している）は DB 上変わらない。
 *
 * Playwright project: chromium-admin（`e2e/authenticated/admin/*.spec.ts`）。
 */

/** seed の E2E fixture デバイス（`prisma/seed.ts` の deviceName）。 */
const FIXTURE_DEVICE_NAME = "[E2E] テストキーパッド";

/** seed が固定している現在値。選択で必ず変わる別の値を選ぶために持つ。 */
const SEEDED_DEVICE_TYPE_LABEL = "Keypad Touch";

/**
 * 選び直す機種。欠陥時にダイアログ本体の裏へ完全に隠れていた行から採る。
 * `Keypad Vision Pro` と前方一致するので exact 指定が要る。
 */
const PICKED_DEVICE_TYPE_LABEL = "Keypad Vision";

const ADMIN_ROUTE_TIMEOUT = 20000;

test("ダイアログ内で開いた Select の選択肢が前面に出て操作できる", async ({
  page,
}) => {
  await page.goto(`${urls.adminSettings}/integrations?tab=switchbot`);

  const registryHeading = page.getByRole("heading", {
    name: "スマートロックデバイス登録簿",
  });
  await expect(registryHeading).toBeVisible({ timeout: ADMIN_ROUTE_TIMEOUT });

  await page
    .getByRole("button", { name: `${FIXTURE_DEVICE_NAME} を編集` })
    .click();

  const dialog = page.getByRole("dialog", {
    name: "スマートロックデバイスを編集",
  });
  await expect(dialog).toBeVisible();

  const deviceTypeSelect = dialog.getByRole("combobox", { name: "機種" });
  await expect(deviceTypeSelect).toHaveText(SEEDED_DEVICE_TYPE_LABEL);
  await deviceTypeSelect.click();

  // ここが本題。option が背後に沈んでいれば click が
  // "intercepts pointer events" で落ちる。
  await page
    .getByRole("option", { name: PICKED_DEVICE_TYPE_LABEL, exact: true })
    .click();

  await expect(deviceTypeSelect).toHaveText(PICKED_DEVICE_TYPE_LABEL);

  // 保存せずに閉じる（DB は seed のまま）。
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
