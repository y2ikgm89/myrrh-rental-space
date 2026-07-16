import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";

/**
 * `/claim/event-registration` - ゲストイベント申込のマイページ追加 E2E（顧客認証済み state）
 *
 * シナリオ:
 *   1. 未紐付け（`EventRegistration.customerId: null`）のゲストイベント申込を1件、
 *      fixture スクリプト経由で直接 DB に作成し、その claim トークンを取得する
 *      （実際の申込作成 UI フローは公開イベント詳細ページ経由のため E2E 対象外
 *      — `claim-reservation.spec.ts` の設計注記と同方針）
 *   2. `/claim/event-registration?token=...` に遷移 → proxy が cookie に転写 →
 *      申込概要（イベント名 + HYBRID 開催の参加 URL、Phase B.1 task 17）が表示される
 *   3. chromium-customer project の認証済み storage state
 *      （`e2e/auth/customer.setup.ts` の E2E ログインバイパス）により、
 *      既にログイン済みの状態で「この申込をマイページに追加する」ボタンが表示される
 *   4. ボタンをクリック → Server Action が claim を実行 →
 *      `/mypage/events` にリダイレクトされ、当該イベント申込が「これから」タブに
 *      参加 URL 付きで表示される（isEventVirtualAccessible gate、Task 3/5/17）
 *
 * 実際の OAuth（Google/LINE）ログインは Google/LINE 側のフローに依存するため
 * Playwright では駆動不可（`e2e/public/customer-auth.spec.ts` の設計注記と同方針）。
 * 本 spec は `chromium-customer` project の E2E ログインバイパス済み state を使う
 * ことで、claim ページ + Server Action の実際の書込フローを実 DB で検証する。
 */

const execFileAsync = promisify(execFile);

interface ClaimEventRegistrationFixture {
  readonly eventRegistrationId: string;
  readonly eventTitle: string;
  readonly meetingUrl: string;
  readonly token: string;
}

async function createClaimEventRegistrationFixture(): Promise<ClaimEventRegistrationFixture> {
  const workspaceRoot = path.join(__dirname, "..", "..", "..");
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "create-claim-event-registration-fixture.ts",
  );

  const { stdout } = await execFileAsync("bun", [scriptPath], {
    cwd: workspaceRoot,
    env: process.env,
  });

  return JSON.parse(stdout.trim()) as ClaimEventRegistrationFixture;
}

test.describe("claim/event-registration - ゲストイベント申込のマイページ追加", () => {
  test("認証済みユーザーが claim リンクからイベント申込をマイページに追加できる", async ({
    page,
  }) => {
    const fixture = await createClaimEventRegistrationFixture();

    await page.goto(`/claim/event-registration?token=${fixture.token}`);

    await expect(
      page.getByRole("heading", { level: 2, name: fixture.eventTitle }),
    ).toBeVisible({ timeout: 10000 });

    // Phase B.1 task 17: claim トークン保持者は claim 前でも HYBRID イベントの
    // 参加 URL を確認できる（isEventVirtualAccessible gate）。
    await expect(
      page.getByRole("link", { name: fixture.meetingUrl }),
    ).toBeVisible();

    const confirmButton = page.getByRole("button", {
      name: "この申込をマイページに追加する",
    });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(page).toHaveURL(/\/mypage\/events$/u, { timeout: 10000 });

    await expect(
      page.getByRole("heading", { level: 1, name: "イベント" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: fixture.eventTitle }),
    ).toBeVisible();
    // claim 後、mypage イベント一覧の同一登録カードにも参加 URL が引き続き表示される。
    await expect(
      page.getByRole("link", { name: fixture.meetingUrl }),
    ).toBeVisible();
  });
});
