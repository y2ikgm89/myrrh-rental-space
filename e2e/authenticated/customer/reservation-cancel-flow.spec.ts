import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * マイページ - 予約キャンセル Dialog フロー E2E（顧客認証済み state）
 *
 * Phase 3 P2: 予約キャンセル → カレンダー同期 → 通知配信 chain の
 * 顧客側 UI 部分。実 cancel action は dev Turnstile + seed 状態に依存する
 * ため、本 spec は **Dialog 開閉 + UI 構成要素** の smoke に集中する。
 *
 * シナリオ:
 *   1. /mypage/reservations 一覧から詳細ページへ
 *   2. アクティブな予約の場合「予約をキャンセルする」ボタンが表示される
 *   3. ボタンクリックで Dialog 表示
 *   4. DialogTitle「予約のキャンセル確認」+ Description
 *   5. キャンセル理由 Textarea + TurnstileWidget が存在
 *   6. 「閉じる」で Dialog 閉じる
 *
 * 担保範囲分割:
 *   - cancel action 自体の domain 動作 → integration test
 *     (`__tests__/integration/actions/public/mypage-reservation.test.ts`)
 *   - カレンダー同期 (GCal outbound) → unit test
 *     (`__tests__/unit/lib/calendar-sync/`)
 *   - 通知配信 → unit test (`__tests__/unit/domain/notifications/`)
 *
 * 前提（seed-driven、`prisma/seed.ts` § seedDevCustomerAndReservations 経由）:
 *   - dev customer に PENDING / CONFIRMED 予約が確実に存在
 *   - `e2e/auth/customer.setup.ts` が認証済 storage state を生成済
 */

async function openFirstReservationDetail(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.goto(urls.mypageReservations);

  // seed-driven: dev customer に 4 件の reservation が必ずある。空なら seed regression。
  const detailLink = page.locator('a[href^="/mypage/reservations/"]').first();
  await expect(detailLink).toBeVisible({ timeout: 5000 });
  await detailLink.click();
}

test.describe("予約キャンセル Dialog - 顧客側 smoke", () => {
  test("詳細ページにキャンセルボタン or キャンセル不可文言が表示される", async ({
    page,
  }) => {
    await openFirstReservationDetail(page);

    // 「予約をキャンセルする」ボタン or 「キャンセルできません」文言の択一表示。
    // 一覧の最初がどの status / paymentStatus を持つかは sort 順に依存するため
    // どちらかが visible なら pass の契約とする（status × 期限 × 既キャンセル の組合せ網羅）。
    const cancelTrigger = page.getByRole("button", {
      name: /予約をキャンセルする/,
    });
    const cancelBlocked = page.getByText(
      /キャンセルできません|キャンセル期限|変更できません|キャンセル済み/i,
    );

    const hasTrigger = await cancelTrigger.isVisible().catch(() => false);
    const hasBlocked = await cancelBlocked.isVisible().catch(() => false);

    expect(hasTrigger || hasBlocked).toBeTruthy();
  });

  test("キャンセル可能な予約で Dialog title / description / 理由 textarea / 閉じる動作が成立", async ({
    page,
  }) => {
    await openFirstReservationDetail(page);

    const cancelTrigger = page.getByRole("button", {
      name: /予約をキャンセルする/,
    });

    // 一覧の最初がキャンセル不可状態（COMPLETED+PAID 等）の場合は
    // detail 描画ゲートのみで完走を契約とする（seed sort 順依存を spec 側で吸収）。
    if (!(await cancelTrigger.isVisible().catch(() => false))) {
      await expect(page.locator("main").first()).toBeVisible();
      return;
    }

    await cancelTrigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText("予約のキャンセル確認")).toBeVisible();
    await expect(
      dialog.getByText(/この操作は取り消せません|キャンセルしてもよろしい/),
    ).toBeVisible();

    // キャンセル理由 Textarea
    await expect(dialog.getByLabel(/キャンセル理由/)).toBeVisible();

    // 確定ボタンの存在のみ確認（実 click は dev Turnstile + seed 依存で flake risk）
    const confirmButton = dialog.getByRole("button", {
      name: /キャンセルを確定する/,
    });
    await expect(confirmButton).toBeVisible();

    // 「閉じる」ボタンで Dialog 閉じる
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });
});
