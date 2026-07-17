import { test, expect } from "@playwright/test";

/**
 * T10 admin proxy registration の smoke E2E。
 *
 * 電話・口頭で申込を受けた参加者を管理者が代理登録するフローを検証する。
 * walk-in の「即受付・確認メール無し」ダイアログとは別 CTA / 別ダイアログとして
 * 分離した実装であることを、Dialog タイトルと必須メール入力の存在で担保する。
 *
 * 実装参照:
 * - 追加 command: src/shared/domain/events/registration-commands.ts
 *   `createAdminProxyRegistrationCommand`
 * - Server Action: src/app/(admin)/admin/(dashboard)/_shared/actions/event-registration.ts
 *   `createAdminProxyRegistration`
 * - Dialog: src/app/(admin)/admin/(dashboard)/events/[id]/check-in/_components/
 *   `ProxyRegistrationDialog.tsx`
 * - Trigger: 同 `CheckInClient.tsx`（walk-in ボタン隣接）
 */

// Next dev compiles admin check-in route lazily. Keep serial so cold route
// compilation is not raced by multiple workers against one server (events.spec.ts と同型)。
test.describe.configure({ mode: "serial" });

const ADMIN_EVENT_ROUTE_TIMEOUT = 20000;

/**
 * seed の SINGLE_OCCURRENCE イベント（ヨガ体験会）を使う。
 * timed-entry の photography-workshop は既存 events.spec.ts の toggle テスト対象で、
 * fixture 干渉を避けるため別イベントを選ぶ。
 */
test.describe("admin proxy registration (T10)", () => {
  test("代行登録 Dialog が開き、事前登録が確定できる", async ({ page }) => {
    // singleOccurrenceSlug のイベント詳細に遷移 → 出欠確認 に遷移
    await page.goto("/admin/events");

    await page
      .getByRole("cell", {
        name: /ヨガ＆マインドフルネス体験会\s+単一開催\s+\/yoga-mindfulness-workshop/u,
      })
      .click();

    await expect(page).toHaveURL(/\/admin\/events\/[^/]+$/u, {
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });

    await page.getByRole("link", { name: "出欠確認" }).click();
    await expect(page).toHaveURL(/\/admin\/events\/[^/]+\/check-in$/u, {
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });

    // 代行登録 ボタンが存在 (walk-in と別 CTA)
    const proxyButton = page.getByRole("button", { name: "代行登録" });
    await expect(proxyButton).toBeVisible({
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });

    await proxyButton.click();

    // Dialog タイトルと説明文で walk-in と区別できていることを確認
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "事前代行登録" }),
    ).toBeVisible({ timeout: ADMIN_EVENT_ROUTE_TIMEOUT });
    await expect(
      dialog.getByText("確認メールを送信します。", { exact: false }),
    ).toBeVisible();

    // 必須フィールドを入力（walk-in と最大の差分: email 必須）
    await dialog
      .getByLabel("氏名", { exact: false })
      .fill("代行登録テスト太郎");
    await dialog
      .getByLabel("メール", { exact: false })
      .fill("proxy@example.com");

    // 送信 → toast で成功通知
    await dialog.getByRole("button", { name: "事前登録を確定" }).click();

    await expect(
      page.getByText("事前代行登録を受け付けました", { exact: false }),
    ).toBeVisible({ timeout: ADMIN_EVENT_ROUTE_TIMEOUT });

    // Dialog が閉じる（web-first assertion）
    await expect(dialog).toBeHidden({ timeout: ADMIN_EVENT_ROUTE_TIMEOUT });

    // 参加者リストに追加された行が現れる（router.refresh 後）
    await expect(
      page.getByRole("button", { name: /代行登録テスト太郎 の出席を記録/u }),
    ).toBeVisible({ timeout: ADMIN_EVENT_ROUTE_TIMEOUT });
  });

  test("代行登録 Dialog の email 必須はクライアント側で強制される", async ({
    page,
  }) => {
    // 別 slug を使うと fixture 干渉が起きないため、同じイベントで validation のみ検証
    // する（一度目のテストで登録済みでも、この検証は submit を発火させない）。
    await page.goto("/admin/events");

    await page
      .getByRole("cell", {
        name: /ヨガ＆マインドフルネス体験会\s+単一開催\s+\/yoga-mindfulness-workshop/u,
      })
      .click();

    await expect(page).toHaveURL(/\/admin\/events\/[^/]+$/u, {
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });

    await page.getByRole("link", { name: "出欠確認" }).click();
    await expect(page).toHaveURL(/\/admin\/events\/[^/]+\/check-in$/u, {
      timeout: ADMIN_EVENT_ROUTE_TIMEOUT,
    });

    await page.getByRole("button", { name: "代行登録" }).click();

    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("heading", { name: "事前代行登録" }),
    ).toBeVisible({ timeout: ADMIN_EVENT_ROUTE_TIMEOUT });

    // メール入力欄が required 属性つきで表示される（Dialog 表示自体が smoke gate の
    // 目的で、実 submit の validation は unit test 側で網羅済み）
    const emailInput = dialog.getByLabel("メール", { exact: false });
    await expect(emailInput).toBeVisible();
    await expect(emailInput).toHaveAttribute("required", "");
  });
});
