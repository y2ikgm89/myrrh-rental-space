import { expect, test, type Locator } from "@playwright/test";
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

async function closeDialogWithEscape(dialog: Locator) {
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
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(cancelTrigger).toBeFocused();
  });
});
