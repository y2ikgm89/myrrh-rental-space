import { test, expect } from "@playwright/test";
import {
  customerReservationTargets,
  openCustomerReservationDetail,
  expectReservationDetailHeading,
} from "./reservation-test-helpers";

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

test.describe("予約キャンセル Dialog - 顧客側 smoke", () => {
  test("キャンセル可能な予約詳細ページにキャンセルボタンが表示される", async ({
    page,
  }) => {
    await openCustomerReservationDetail(
      page,
      customerReservationTargets.pendingUnpaid,
    );

    await expect(
      page.getByRole("button", { name: "予約をキャンセルする" }),
    ).toBeVisible();
  });

  test("キャンセル可能な予約で Dialog title / description / 理由 textarea / 閉じる動作が成立", async ({
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

    await dialog
      .getByRole("group", { name: "予約キャンセル操作" })
      .getByRole("button", { name: "閉じる", exact: true })
      .click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await expectReservationDetailHeading(page);
  });
});
