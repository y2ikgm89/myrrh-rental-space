import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { test, expect } from "../../fixtures/e2e-test";
import { urls } from "../../fixtures";

/**
 * イベント waitlist FIFO 自動昇格 - 顧客認証済み state E2E (E2E-P2-02)
 *
 * ## 検証対象
 *
 * `applyEventRegistrationCancellation` (`src/shared/domain/events/registration-cancel-core.ts`)
 * が CONFIRMED 由来のキャンセルで advisory lock (namespace 728350) 直下の同一 tx から
 * `offerNextWaitlistEntryCommand` を呼び、同じ (slotId, ticketId) の FIFO 先頭
 * (`waitlistedAt ASC LIMIT 1`) を WAITLISTED → WAITLISTED_OFFERED に atomic claim で
 * 昇格させる挙動。domain 層の並行性・冪等性は unit / integration テスト
 * (`__tests__/integration/actions/public/event-cancel-promotes-waitlist.test.ts` 等) が
 * 担保している。本 spec は「その domain 遷移が実際に dev customer の
 * `/mypage/events` の badge / countdown UI に反映される」ことを end-to-end で
 * 実証する (integration テストでは覆えない serialize / props / RSC → CSR の
 * hydration まで含む pipeline)。
 *
 * ## シナリオ
 *
 * 1. 満員 (capacity=1) のイベントを fixture 直生成 (`create-waitlist-test-fixture.ts`)。
 *    - 定員を埋める filler CONFIRMED 申込 (無関係なゲストメール)
 *    - dev customer (`dev-customer@example.com`) の WAITLISTED 申込
 * 2. dev customer として `/mypage/events` にアクセスし、当該申込のカードが
 *    「キャンセル待ち」badge + 「番目です」順位メッセージで表示されることを確認。
 * 3. filler CONFIRMED を `cancel-event-registration-fixture.ts` 経由で
 *    `adminCancelEventRegistrationCommand` (production code path) で実キャンセル。
 *    これが同一 tx 内で `offerNextWaitlistEntryCommand` を発火し、dev customer の
 *    WAITLISTED が WAITLISTED_OFFERED に昇格する。stdout の `promoted.id` が dev
 *    customer の申込 ID と一致することを assertion (domain 遷移の証拠)。
 * 4. `/mypage/events` を再取得し、当該申込のカードが「繰り上げ当選中」badge +
 *    OFFER 期限メッセージに切り替わっていることを確認 (UI 反映の証拠)。
 *
 * ## Turnstile / 実 UI 経由のキャンセルを使わない理由
 *
 * `waitlist.spec.ts` / `reservation-cancel-flow.spec.ts` と同じ既存判断
 * (「dev Turnstile + DB write を伴う実 click は flake risk」) を継承。本 spec の
 * 主眼は「キャンセルが起きたときの WAITLISTED → OFFERED 昇格 chain と mypage UI 反映」
 * であり、キャンセル操作の入口 (UI vs script) は E2E 対象範囲外。cancel の domain
 * 関数を直接叩くことで、advisory lock (728350) 取得と
 * `offerNextWaitlistEntryCommand` 呼び出しを含む production code path を通過させる。
 *
 * ## 並行 cancel での二重昇格防止 (task の bonus 項)
 *
 * 「並列に 2 件キャンセルしても 1 件しか昇格しない」ことは
 * `updateMany` の atomic claim (`registration-cancel-core.ts` の JSDoc 参照) と
 * advisory lock 728350 による直列化で保証される。並行実行の再現は Playwright
 * worker 内での promise 起動タイミングと DB commit の race に依存し flake しやすい
 * ため、この並行性そのものは `__tests__/unit/shared/domain/events/registration-cancel-core.test.ts`
 * 等の実 DB 統合テスト側でのみ検証する (E2E では扱わない)。
 */

const execFileAsync = promisify(execFile);

interface WaitlistTestFixture {
  readonly eventSlug: string;
  readonly eventTitle: string;
  readonly eventId: string;
  readonly waitlistedRegistrationId: string;
  readonly fillerRegistrationId: string;
}

interface CancelPromoteResult {
  readonly cancelledRegistrationId: string;
  readonly promoted: {
    readonly id: string;
    readonly email: string | null;
    readonly offeredAt: string;
    readonly expiresAt: string;
  } | null;
}

const workspaceRoot = path.join(__dirname, "..", "..", "..");

async function createWaitlistTestFixture(): Promise<WaitlistTestFixture> {
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

async function cancelRegistrationAndPromote(
  registrationId: string,
): Promise<CancelPromoteResult> {
  const scriptPath = path.join(
    workspaceRoot,
    "scripts",
    "e2e",
    "cancel-event-registration-fixture.ts",
  );

  const { stdout } = await execFileAsync("bun", [scriptPath, registrationId], {
    cwd: workspaceRoot,
    env: process.env,
  });

  return JSON.parse(stdout.trim()) as CancelPromoteResult;
}

test.describe("マイページ - イベント waitlist 自動昇格 (キャンセル起点)", () => {
  test("先行 CONFIRMED のキャンセルで dev customer 申込が WAITLISTED_OFFERED に遷移し UI に反映される", async ({
    page,
  }) => {
    await page.clock.install({ time: new Date("2026-07-04T03:00:00.000Z") });

    const fixture = await createWaitlistTestFixture();

    // ---------------------------------------------------------------------
    // 前提状態: dev customer の申込は WAITLISTED (キャンセル待ち)
    // ---------------------------------------------------------------------
    await page.goto(urls.mypageEvents);

    await expect(
      page.getByRole("heading", { level: 1, name: "イベント" }),
    ).toBeVisible();

    // `waitlist.spec.ts` と同じロケーター戦略: 「これから」タブは
    // WAITLISTED / WAITLISTED_OFFERED を含む (ACTIVE_REGISTRATION_STATUSES) ため
    // tab を明示せずカードにフィルタして絞り込む。
    const card = page
      .getByRole("article")
      .filter({ hasText: fixture.eventTitle });
    await expect(card).toBeVisible();
    await expect(
      card.getByText("キャンセル待ち", { exact: true }),
    ).toBeVisible();
    // Foundation task #8: WAITLISTED の順位表示は「現在 N 番目です」形式。
    // 位置は 1 番目 (dev customer は 1 人しかいない WAITLISTED) だが、静的
    // 断言は seed 順序で壊れやすいため /番目/ の存在のみ確認する。
    await expect(card.getByText(/番目/)).toBeVisible();

    // ---------------------------------------------------------------------
    // filler CONFIRMED を実キャンセル → domain 層で FIFO promote 発火
    // ---------------------------------------------------------------------
    const cancelResult = await cancelRegistrationAndPromote(
      fixture.fillerRegistrationId,
    );

    // domain 層で本当に dev customer の申込が昇格したことの直接証拠
    // (UI 反映が起きる前提条件の assertion)。
    expect(cancelResult.promoted).not.toBeNull();
    expect(cancelResult.promoted?.id).toBe(fixture.waitlistedRegistrationId);

    // ---------------------------------------------------------------------
    // UI 反映: 「キャンセル待ち」→「繰り上げ当選中」に切り替わる
    // ---------------------------------------------------------------------
    await page.goto(urls.mypageEvents);

    const promotedCard = page
      .getByRole("article")
      .filter({ hasText: fixture.eventTitle });
    await expect(promotedCard).toBeVisible();
    await expect(
      promotedCard.getByText("繰り上げ当選中", { exact: true }),
    ).toBeVisible();
    // WAITLISTED_OFFERED は OfferCountdown + 「確定用のリンクをメールでお送り
    // しています。」メッセージが常に表示される (payment PENDING gate 独立)。
    await expect(
      promotedCard.getByText(/確定用のリンクをメールでお送りしています/),
    ).toBeVisible();
    // 「キャンセル待ち」badge は消えている (WAITLISTED → OFFERED の遷移確認)。
    await expect(
      promotedCard.getByText("キャンセル待ち", { exact: true }),
    ).toHaveCount(0);
  });
});
