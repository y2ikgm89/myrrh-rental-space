import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "../../fixtures/e2e-test";
import { urls } from "../../fixtures";

/**
 * イベント waitlist 繰り上げ当選 — 無料チケット確定 E2E (Phase 7 PR10)
 *
 * Turnstile 必須の confirm action 実 click は flake risk のため、
 * `confirmWaitlistOfferCommand` を fixture script 経由で実行し、
 * mypage UI への CONFIRMED 反映を検証する（`waitlist-auto-promotion-on-cancel.spec.ts` と同方針）。
 */

const execFileAsync = promisify(execFile);
const workspaceRoot = path.join(__dirname, "..", "..", "..");

interface WaitlistOfferConfirmFixture {
  readonly eventTitle: string;
  readonly registrationId: string;
  readonly token: string;
}

async function createWaitlistOfferFixture(): Promise<WaitlistOfferConfirmFixture> {
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "create-waitlist-offer-confirm-fixture.ts",
  );
  const { stdout } = await execFileAsync("bun", [scriptPath], {
    cwd: workspaceRoot,
    env: process.env,
  });
  return JSON.parse(stdout.trim()) as WaitlistOfferConfirmFixture;
}

async function confirmWaitlistOffer(registrationId: string): Promise<void> {
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "create-waitlist-offer-confirm-fixture.ts",
  );
  await execFileAsync("bun", [scriptPath, `--confirm=${registrationId}`], {
    cwd: workspaceRoot,
    env: process.env,
  });
}

test.describe("waitlist offer — 無料チケット確定", () => {
  test("confirm ランディングが表示され、確定後に mypage が参加確定 badge を示す", async ({
    page,
  }) => {
    // fixture script を 2 回 spawn する（作成 + 確定）。それぞれ bun 起動 +
    // Prisma client 初期化を伴い、CI の並列実行下では既定 30s を安定して超える
    // （run 30569714860 は 3 回とも 30s timeout、ページ描画自体は成功していた）。
    test.slow();

    const offered = await createWaitlistOfferFixture();

    await page.goto(`/events/waitlist/confirm?token=${offered.token}`);

    await expect(
      page.getByRole("heading", { level: 1, name: "繰り上げ当選の確認" }),
    ).toBeVisible({ timeout: 10000 });
    await expect(
      page.getByRole("button", { name: "参加を確定する" }),
    ).toBeVisible();

    await confirmWaitlistOffer(offered.registrationId);

    await page.goto(urls.mypageEvents);

    const card = page
      .getByRole("article")
      .filter({ hasText: offered.eventTitle });
    await expect(card).toBeVisible();
    await expect(card.getByText("申込済み", { exact: true })).toBeVisible({
      timeout: 10000,
    });
  });
});
