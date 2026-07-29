import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";

/**
 * ゲスト予約 status hub 閲覧 E2E (Phase 7 PR9)
 *
 * `/reservation/status?token=...` → proxy cookie 転写 → 予約サマリー表示。
 * claim / edit / cancel の実送信は別 spec / integration が担当。
 */

const execFileAsync = promisify(execFile);
const workspaceRoot = path.join(__dirname, "..", "..");

interface GuestStatusFixture {
  readonly reservationId: string;
  readonly spaceName: string;
  readonly token: string;
}

async function createGuestStatusFixture(): Promise<GuestStatusFixture> {
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "create-guest-status-fixture.ts",
  );
  const { stdout } = await execFileAsync("bun", [scriptPath], {
    cwd: workspaceRoot,
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as GuestStatusFixture;
}

test.describe("ゲスト予約 status hub — 閲覧", () => {
  test("有効 token で予約ステータス hub が表示される", async ({ page }) => {
    const fixture = await createGuestStatusFixture();

    await page.goto(`/reservation/status?token=${fixture.token}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "予約ステータス" }),
    ).toBeVisible({ timeout: 10000 });

    await expect(page.getByText(fixture.spaceName)).toBeVisible();
    await expect(page.getByText("未払い", { exact: true })).toBeVisible();
  });
});
