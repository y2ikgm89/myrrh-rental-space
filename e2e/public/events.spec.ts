import { test, expect } from "@playwright/test";
import { eventFixtures } from "../fixtures";

test.describe("イベント詳細 - 開催方式別申込 UI", () => {
  test("単一開催では参加日時セレクターを表示しない", async ({ page }) => {
    await page.goto(`/events/${eventFixtures.singleOccurrenceSlug}`);

    const form = page.getByRole("region", { name: "参加申込" });
    await expect(form).toBeVisible();
    await expect(form.getByText(/残り枠:\s*\d+ 名/u)).toBeVisible();
    await expect(form.getByText("参加日時を選択")).toHaveCount(0);
    await expect(form.getByRole("radio")).toHaveCount(0);
    await expect(
      form.getByRole("spinbutton", { name: "参加人数" }),
    ).toHaveAttribute("max", /\d+/u);
  });

  test("日時選択制では枠選択を表示し、選択変更で残り枠が更新される", async ({
    page,
  }) => {
    await page.goto(`/events/${eventFixtures.timedEntrySlug}`);

    const form = page.getByRole("region", { name: "参加申込" });
    await expect(form).toBeVisible();
    await expect(form.getByText("参加日時を選択")).toBeVisible();
    await expect(form.getByText(/選択中の残り枠:\s*5 名/u)).toBeVisible();

    const slotOptions = form.getByRole("radio");
    await expect(slotOptions).toHaveCount(2);

    await slotOptions.nth(1).check();
    await expect(form.getByText(/選択中の残り枠:\s*8 名/u)).toBeVisible();
    await expect(
      form.getByRole("spinbutton", { name: "参加人数" }),
    ).toHaveAttribute("max", "8");
  });
});
