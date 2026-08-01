import { expect, test } from "../../fixtures/e2e-test";
import {
  collectCspViolations,
  formatCspViolations,
} from "../../helpers/csp-violations";

/**
 * inline style の CSP 契約を「実際に `<style>` が注入される瞬間」で検証する。
 *
 * 対象は 2 経路:
 *
 * 1. **sonner**（admin の Toaster）— module 評価時に `__insertCSS()` で `<style>` を
 *    注入する。nonce API を持たないので `style-src` の内容一致 hash で通している
 *    （`src/shared/lib/csp/inline-style-hashes.ts`）。ページを開くだけで発火する。
 * 2. **Radix の scroll lock**（`react-remove-scroll-bar` → `react-style-singleton`）—
 *    **ダイアログを開いた瞬間**に `<style>` を注入する。CSS はスクロールバー幅の実測値を
 *    含むため hash 化できず、`RegisterStyleNonce` が `get-nonce` に nonce を渡すことで
 *    通している。これが壊れると背面スクロールが固定されず、ガタつき補正も効かない。
 *
 * コマンドパレットは `/admin` から 1 クリックで開ける最小の Radix Dialog なので、
 * scroll lock を踏ませる経路として使う。
 */
test.describe("admin inline style CSP", () => {
  test("ダッシュボードとダイアログ open で CSP violation が出ない", async ({
    page,
  }) => {
    const cspViolations = collectCspViolations(page);

    await page.goto("/admin");
    await expect(
      page.getByRole("heading", { name: "ダッシュボード" }),
    ).toBeVisible();

    // sonner は import 時点で <style> を注入済み。ここで落ちたら hash drift。
    expect(
      cspViolations,
      `CSP violations on /admin: ${formatCspViolations(cspViolations)}`,
    ).toEqual([]);

    const trigger = page.getByRole("button", { name: "検索を開く" }).first();
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "コマンドパレット" });
    await expect(dialog).toBeVisible();

    // scroll lock の <style> は dialog mount 時に注入される。
    expect(
      cspViolations,
      `CSP violations after opening the dialog: ${formatCspViolations(cspViolations)}`,
    ).toEqual([]);

    // 前提: scroll lock が発火している（属性は CSP と無関係に付く）。
    await expect(page.locator("body")).toHaveAttribute("data-scroll-locked");

    // 本命: 注入された CSS が**適用されている**こと。CSP にブロックされた `<style>` も
    // DOM 上には残るため、要素の有無ではなく算出値で判定する。
    // `body[data-scroll-locked] { overflow: hidden !important }` が効けば hidden。
    const bodyOverflow = await page.evaluate(
      () => getComputedStyle(document.body).overflow,
    );
    expect(
      bodyOverflow,
      "scroll lock の <style> が CSP でブロックされている（nonce 未設定の疑い）",
    ).toBe("hidden");

    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });
});
