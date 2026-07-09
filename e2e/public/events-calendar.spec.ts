import { expect, test } from "@playwright/test";
import { urls } from "../fixtures";

test.describe("イベント一覧 - カレンダー表示", () => {
  test("日付グリッドを選択状態とキーボードで操作できる", async ({ page }) => {
    await page.clock.install({ time: new Date("2026-07-04T03:00:00.000Z") });
    await page.goto(urls.events);

    await page.getByRole("tab", { name: "カレンダー" }).click();

    const grid = page.getByRole("grid", {
      name: "2026年7月のイベントカレンダー",
    });
    await expect(grid).toBeVisible();

    const today = grid.getByRole("gridcell", {
      name: /2026年7月4日（今日）/u,
    });
    await expect(today).toHaveAttribute("aria-current", "date");
    await expect(today).toHaveAttribute("tabindex", "0");

    await today.focus();
    await page.keyboard.press("ArrowRight");
    await expect(
      grid.getByRole("gridcell", { name: /2026年7月5日/u }),
    ).toBeFocused();

    await page.keyboard.press("ArrowRight");
    const selectedDate = grid.getByRole("gridcell", {
      name: /2026年7月6日/u,
    });
    await expect(selectedDate).toBeFocused();

    await page.keyboard.press("Enter");

    await expect(selectedDate).toHaveAttribute("aria-selected", "true");
    await expect(today).not.toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("7月6日", { exact: true })).toBeVisible();
  });
});
