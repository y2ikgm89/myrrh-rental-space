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
 * 前提:
 *   - playwright.config.ts の chromium-customer project で実行
 *   - setup-customer により dev customer が認証済み
 *   - dev サーバー稼働中
 *   - dev customer に既存予約がない場合は test.skip でスキップ
 */

test.describe("予約キャンセル Dialog - 顧客側 smoke", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(urls.mypageReservations);
    await page.waitForLoadState("networkidle");
  });

  test("詳細ページでキャンセル可能な予約に Dialog 起動ボタンが表示される", async ({
    page,
  }) => {
    const detailLink = page.locator('a[href^="/mypage/reservations/"]').first();
    if (!(await detailLink.isVisible().catch(() => false))) {
      test.skip(true, "dev customer に予約がありません");
      return;
    }
    await detailLink.click();
    await page.waitForLoadState("networkidle");

    // 「予約をキャンセルする」ボタン（cancel-button.tsx の primary trigger）
    // または「キャンセルできません / キャンセル期限」文言のいずれか
    const cancelTrigger = page.getByRole("button", {
      name: /予約をキャンセルする/,
    });
    const cancelBlocked = page.getByText(
      /キャンセルできません|キャンセル期限|変更できません/i,
    );

    const hasTrigger = await cancelTrigger.isVisible().catch(() => false);
    const hasBlocked = await cancelBlocked.isVisible().catch(() => false);

    expect(hasTrigger || hasBlocked).toBeTruthy();
  });

  test("Dialog 表示で title / description / 理由 textarea が見える", async ({
    page,
  }) => {
    const detailLink = page.locator('a[href^="/mypage/reservations/"]').first();
    if (!(await detailLink.isVisible().catch(() => false))) {
      test.skip(true, "dev customer に予約がありません");
      return;
    }
    await detailLink.click();
    await page.waitForLoadState("networkidle");

    const cancelTrigger = page.getByRole("button", {
      name: /予約をキャンセルする/,
    });
    if (!(await cancelTrigger.isVisible().catch(() => false))) {
      test.skip(
        true,
        "キャンセル可能な予約がありません（期限切れ/既キャンセル）",
      );
      return;
    }
    await cancelTrigger.click();

    // Radix Dialog: role="dialog" + DialogTitle/DialogDescription
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText("予約のキャンセル確認")).toBeVisible();
    await expect(
      dialog.getByText(/この操作は取り消せません|キャンセルしてもよろしい/),
    ).toBeVisible();

    // キャンセル理由 Textarea（label="キャンセル理由（任意）"）
    await expect(dialog.getByLabel(/キャンセル理由/)).toBeVisible();
  });

  test("Dialog の「閉じる」ボタンで Dialog が閉じる", async ({ page }) => {
    const detailLink = page.locator('a[href^="/mypage/reservations/"]').first();
    if (!(await detailLink.isVisible().catch(() => false))) {
      test.skip(true, "dev customer に予約がありません");
      return;
    }
    await detailLink.click();
    await page.waitForLoadState("networkidle");

    const cancelTrigger = page.getByRole("button", {
      name: /予約をキャンセルする/,
    });
    if (!(await cancelTrigger.isVisible().catch(() => false))) {
      test.skip(true, "キャンセル可能な予約がありません");
      return;
    }
    await cancelTrigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // DialogFooter の「閉じる」ボタン（cancel-button.tsx 実装）
    await dialog.getByRole("button", { name: "閉じる", exact: true }).click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });

  test("Dialog で「キャンセルを確定する」ボタンが存在する", async ({
    page,
  }) => {
    const detailLink = page.locator('a[href^="/mypage/reservations/"]').first();
    if (!(await detailLink.isVisible().catch(() => false))) {
      test.skip(true, "dev customer に予約がありません");
      return;
    }
    await detailLink.click();
    await page.waitForLoadState("networkidle");

    const cancelTrigger = page.getByRole("button", {
      name: /予約をキャンセルする/,
    });
    if (!(await cancelTrigger.isVisible().catch(() => false))) {
      test.skip(true, "キャンセル可能な予約がありません");
      return;
    }
    await cancelTrigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // 確定ボタン（実装の text: 「キャンセルを確定する」、isPending 中は「キャンセル中...」）
    const confirmButton = dialog.getByRole("button", {
      name: /キャンセルを確定する/,
    });
    await expect(confirmButton).toBeVisible();

    // 実 click は走らせない（dev Turnstile + seed dependency で flake risk）
    // → cancel action 動作は integration test で担保
  });
});
