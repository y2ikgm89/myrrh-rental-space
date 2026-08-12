import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "../../fixtures/e2e-test";

import { installFrozenClock } from "../../helpers/frozen-clock";
/**
 * マイページ — SwitchBot 解錠番号表示 E2E (Phase 7 PR12)
 *
 * fixture が switchbotEnabled + CONFIRMED passcode 行を用意し、
 * 固定 clock 下で「解錠番号を表示」→ 平文表示を検証する。
 */

const execFileAsync = promisify(execFile);
const workspaceRoot = path.join(__dirname, "..", "..", "..");

interface PasscodeRevealFixture {
  readonly reservationId: string;
  readonly spaceName: string;
  readonly passcode: string;
  readonly fixedNowIso: string;
}

async function createPasscodeRevealFixture(): Promise<PasscodeRevealFixture> {
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "create-passcode-reveal-fixture.ts",
  );
  const { stdout } = await execFileAsync("bun", [scriptPath], {
    cwd: workspaceRoot,
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as PasscodeRevealFixture;
}

test.describe("マイページ — 解錠番号表示", () => {
  test("表示ボタンで passcode 平文が reveal される", async ({ page }) => {
    const fixture = await createPasscodeRevealFixture();

    await installFrozenClock(page, new Date(fixture.fixedNowIso));

    await page.goto(`/mypage/reservations/${fixture.reservationId}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "予約詳細" }),
    ).toBeVisible({ timeout: 10000 });

    const revealButton = page.getByRole("button", { name: "解錠番号を表示" });
    await expect(revealButton).toBeVisible({ timeout: 10000 });
    await revealButton.click();

    await expect(page.getByText(fixture.passcode)).toBeVisible({
      timeout: 10000,
    });
  });
});
