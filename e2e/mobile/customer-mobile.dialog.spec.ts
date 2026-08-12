import { expect, test, type Locator } from "../fixtures/e2e-test";
import {
  customerReservationTargets,
  openCustomerReservationDetail,
} from "../authenticated/customer/reservation-test-helpers";

async function expectFocusedWithin(locator: Locator) {
  await expect
    .poll(() =>
      locator.evaluate((root) => root.contains(document.activeElement)),
    )
    .toBe(true);
}

async function expectDialogCanCloseAndReopenFromTouchTrigger(
  trigger: Locator,
  dialog: Locator,
) {
  await closeDialogWithEscape(dialog);
  await expect(trigger).toBeVisible();
  await expect(trigger).toBeEnabled();

  await trigger.click();
  await expect(dialog).toBeVisible();
  await closeDialogWithEscape(dialog);
}

/**
 * Escape でダイアログを閉じる。
 *
 * **押す前に必ずダイアログ本体へフォーカスを戻す。** `keyboard.press` は
 * **フォーカスされているフレーム**にキーを届けるので、focus がダイアログ内の
 * cross-origin iframe（このダイアログは Turnstile ウィジェットを含む）にあると、
 * keydown は iframe 側の document に落ちて、親 document で待つ Radix の dismiss
 * ハンドラまで来ない。ダイアログは開いたままになる。
 *
 * 実測（webkit、`about:blank` の iframe を挿して focus させた再現）:
 * `document.activeElement` が IFRAME のときだけ
 * `expect(dialog).not.toBeVisible()` が 100% 失敗する。CI では Turnstile の
 * iframe が `Tab` より先に載った run だけ落ちるため flaky に見えていた
 * （run 31567495891 の trace に `challenges.cloudflare.com` の frame snapshot が
 * `Tab` の 22ms 前から存在する）。**アプリ側では直せない** — cross-origin frame は
 * キーイベントを親へ渡さないため。テスト側でキーの宛先を確定させる。
 *
 * ダイアログ本体は Radix が `tabindex="-1"` を付けるのでフォーカスできる。
 */
async function closeDialogWithEscape(dialog: Locator) {
  await dialog.focus();
  await dialog.page().keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
}

test.describe("customer mobile dialog interactions", () => {
  test("reservation cancel dialog keeps its labeled controls usable on touch mobile", async ({
    page,
  }) => {
    await openCustomerReservationDetail(
      page,
      customerReservationTargets.pendingUnpaid,
    );

    const cancelTrigger = page.getByRole("button", {
      name: "予約をキャンセルする",
    });
    await expect(cancelTrigger).toBeVisible();
    await cancelTrigger.click();

    const dialog = page.getByRole("dialog", {
      name: "予約のキャンセル確認",
    });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute("aria-modal", "true");
    await expect(dialog.getByLabel(/キャンセル理由/u)).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /キャンセルを確定する/u }),
    ).toBeVisible();

    await page.keyboard.press("Tab");
    await expectFocusedWithin(dialog);

    await expectDialogCanCloseAndReopenFromTouchTrigger(cancelTrigger, dialog);

    await cancelTrigger.focus();
    await expect(cancelTrigger).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await closeDialogWithEscape(dialog);
    await expect(cancelTrigger).toBeFocused();
  });
});
