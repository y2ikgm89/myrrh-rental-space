import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";
import {
  expectReservationDetailHeading,
  getReservationDetailHeader,
} from "./reservation-test-helpers";

/**
 * `/claim/reservation` - ゲスト予約のマイページ追加 E2E（顧客認証済み state）
 *
 * シナリオ:
 *   1. 未紐付け（`Customer.userId: null`）のゲスト予約を1件、fixture スクリプト
 *      経由で直接 DB に作成し、その claim トークンを取得する
 *      （実際の予約作成 UI フローは Stripe checkout を経由するため E2E 対象外
 *      — `e2e/authenticated/customer/stripe-payment.spec.ts` の設計注記と同方針）
 *   2. `/claim/reservation?token=...` に遷移 → proxy が cookie に転写 →
 *      予約概要（スペース名）が表示される
 *   3. chromium-customer project の認証済み storage state
 *      （`e2e/auth/customer.setup.ts` の E2E ログインバイパス）により、
 *      既にログイン済みの状態で「この予約をマイページに追加する」ボタンが表示される
 *   4. ボタンをクリック → Server Action が claim を実行 →
 *      `/mypage/reservations/<id>` にリダイレクトされ、当該予約が表示される
 *
 * 実際の OAuth（Google/LINE）ログインは Google/LINE 側のフローに依存するため
 * Playwright では駆動不可（`e2e/public/customer-auth.spec.ts` の設計注記と同方針）。
 * 本 spec は `chromium-customer` project の E2E ログインバイパス済み state を使う
 * ことで、claim ページ + Server Action の実際の書込フローを実 DB で検証する。
 */

const execFileAsync = promisify(execFile);

interface ClaimReservationFixture {
  readonly reservationId: string;
  readonly spaceName: string;
  readonly token: string;
}

async function createClaimReservationFixture(): Promise<ClaimReservationFixture> {
  const workspaceRoot = path.join(__dirname, "..", "..", "..");
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "create-claim-reservation-fixture.ts",
  );

  const { stdout } = await execFileAsync("bun", [scriptPath], {
    cwd: workspaceRoot,
    env: process.env,
  });

  return JSON.parse(stdout.trim()) as ClaimReservationFixture;
}

test.describe("claim/reservation - ゲスト予約のマイページ追加", () => {
  test("認証済みユーザーが claim リンクから予約をマイページに追加できる", async ({
    page,
  }) => {
    const fixture = await createClaimReservationFixture();

    await page.goto(`/claim/reservation?token=${fixture.token}`);

    await expect(
      page.getByRole("heading", { level: 2, name: fixture.spaceName }),
    ).toBeVisible({ timeout: 10000 });

    const confirmButton = page.getByRole("button", {
      name: "この予約をマイページに追加する",
    });
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    await expect(page).toHaveURL(
      new RegExp(`/mypage/reservations/${fixture.reservationId}$`, "u"),
      { timeout: 10000 },
    );

    await expectReservationDetailHeading(page);
    await expect(
      getReservationDetailHeader(page, fixture.spaceName),
    ).toBeVisible();
  });
});
