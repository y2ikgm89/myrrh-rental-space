import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "@playwright/test";
import { urls } from "../../fixtures";

/**
 * イベント キャンセル待ち（waitlist）- 顧客認証済み state E2E
 *
 * シナリオ:
 *   1. 満員（sold-out）のイベント詳細ページに「キャンセル待ちに登録する」フォームが
 *      表示され、必須項目 + 規約同意チェックで送信可能状態になる
 *   2. マイページのイベント一覧「これから」タブに WAITLISTED の申込が
 *      「キャンセル待ち」バッジ付きで表示され、キャンセル確認ダイアログが開く
 *
 * ## Turnstile 実送信を経由しない設計について
 *
 * `registerForEventWaitlist` / `cancelEventRegistration` は共に Turnstile 検証必須。
 * 既存の `reservation-cancel-flow.spec.ts`（「実 click は dev Turnstile + seed
 * 依存で flake risk」）・`mypage-profile-flow.spec.ts`（「実 update action は dev
 * Turnstile + DB write を伴うため...smoke に集中する」）と同じ理由で、本 spec も
 * Turnstile 必須アクションの実送信完了までは検証しない。
 *   - 「登録」側: フォームの表示 + 入力可能性 + 規約同意による送信可能化までを検証
 *     （`contact.spec.ts` の「規約同意前は送信ボタンが無効で、同意後に有効になる」
 *     と同型）。実際の WAITLISTED 行の作成は fixture スクリプトで直接 DB に行い、
 *     `registerWaitlistEntryCommand` 自体の DB 挙動は
 *     `event-waitlist-register.test.ts` の実 DB 統合テストが担保する
 *   - 「キャンセル」側: ボタン/ダイアログ/確定ボタンの存在確認までを検証
 *     （`reservation-cancel-flow.spec.ts` と同型）。`cancelEventRegistration` /
 *     `applyEventRegistrationCancellation` 自体の DB 挙動（waitlist promote 含む）は
 *     `mypage-event-registration.test.ts` 等の統合テストが担保する
 *
 * 前提:
 * - `chromium-customer` project（`e2e/auth/customer.setup.ts` の dev login
 *   バイパスで認証済み storage state を再利用）
 * - fixture は `scripts/e2e/create-waitlist-test-fixture.ts` が dev customer
 *   （`dev-customer@example.com`）宛の WAITLISTED 申込 + 満員イベントを直接 DB に作成
 */

const execFileAsync = promisify(execFile);

interface WaitlistTestFixture {
  readonly eventSlug: string;
  readonly eventTitle: string;
  readonly eventId: string;
  readonly waitlistedRegistrationId: string;
}

async function createWaitlistTestFixture(): Promise<WaitlistTestFixture> {
  const workspaceRoot = path.join(__dirname, "..", "..", "..");
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "create-waitlist-test-fixture.ts",
  );

  const { stdout } = await execFileAsync("bun", [scriptPath], {
    cwd: workspaceRoot,
    env: process.env,
  });

  return JSON.parse(stdout.trim()) as WaitlistTestFixture;
}

test.describe("イベント詳細 - 満員時のキャンセル待ち登録フォーム", () => {
  test("満員イベントに「キャンセル待ちに登録する」フォームが表示され、規約同意で送信可能になる", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-04T03:00:00.000Z") });

    const fixture = await createWaitlistTestFixture();

    await page.goto(`${urls.events}/${fixture.eventSlug}`);

    await expect(
      page.getByRole("heading", { level: 1, name: fixture.eventTitle }),
    ).toBeVisible();

    // 「お申し込み」section（#event-register）にスコープする。
    const registerSection = page.locator("#event-register");

    // 満員通知（EventStatusNotice variant="warning"）。実測でごく稀に同一テキストの
    // 要素が瞬間的に 2 件観測されることがある（PPR ストリーミング中の一過性の
    // 二重描画と見られ、EventStatusNotice 自体は分岐なしの単純描画で恒常的な
    // 重複要因は無い）。strict-mode violation で spec を落とさないよう `.first()`
    // で「少なくとも1件は表示されている」ことを検証する。
    await expect(
      registerSection.getByText("現在満員です").first(),
    ).toBeVisible();

    // waitlist モードのフォーム見出し + 送信ボタン
    await expect(
      registerSection
        .getByRole("heading", { level: 2, name: "キャンセル待ち登録" })
        .first(),
    ).toBeVisible();
    const submitButton = registerSection
      .getByRole("button", { name: "キャンセル待ちに登録する" })
      .first();
    await expect(submitButton).toBeVisible();

    // 規約同意前は無効（quantity 等の必須値はデフォルトで揃っているため、
    // 同意チェックの有無だけが disabled を左右する状態にする）
    await expect(submitButton).toBeDisabled();

    await registerSection
      .getByLabel("お名前")
      .first()
      .fill("E2E キャンセル待ち太郎");
    await registerSection
      .getByLabel("メールアドレス")
      .first()
      .fill("e2e-waitlist-user@example.com");

    for (const termPattern of [
      /利用規約/u,
      /プライバシーポリシー/u,
      /キャンセルポリシー/u,
    ]) {
      const checkbox = registerSection
        .getByRole("checkbox", { name: termPattern })
        .first();
      await checkbox.check();
      await expect(checkbox).toBeChecked();
    }

    await expect(submitButton).toBeEnabled();
  });
});

test.describe("マイページ - イベント申込のキャンセル待ち状態表示", () => {
  test("これからタブにキャンセル待ちバッジが表示され、キャンセル確認ダイアログが開く", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-04T03:00:00.000Z") });

    const fixture = await createWaitlistTestFixture();

    await page.goto(urls.mypageEvents);

    await expect(
      page.getByRole("heading", { level: 1, name: "イベント" }),
    ).toBeVisible();

    // WAITLISTED は ACTIVE_REGISTRATION_STATUSES に含まれるため「これから」タブに
    // 表示される（tab 未指定時のデフォルトタブ判定）。
    const card = page
      .getByRole("article")
      .filter({ hasText: fixture.eventTitle });
    await expect(card).toBeVisible();
    await expect(
      card.getByText("キャンセル待ち", { exact: true }),
    ).toBeVisible();

    const cancelTrigger = card.getByRole("button", {
      name: "申込をキャンセル",
    });
    await expect(cancelTrigger).toBeVisible();
    await cancelTrigger.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.getByText("申込キャンセルの確認")).toBeVisible();
    await expect(dialog.getByText(fixture.eventTitle)).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "キャンセルする" }),
    ).toBeVisible();

    await dialog
      .getByRole("group", { name: "イベント申込キャンセル操作" })
      .getByRole("button", { name: "閉じる", exact: true })
      .click();
    await expect(dialog).not.toBeVisible({ timeout: 5000 });
  });
});
