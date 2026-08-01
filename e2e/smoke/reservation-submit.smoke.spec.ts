import { test, expect, type Page } from "@playwright/test";
import { spaceFixtures, uniqueEmail, urls } from "../fixtures";

/**
 * ゲスト予約の送信 happy path（smoke / 未認証）
 *
 * ## なぜ smoke に置くか
 *
 * 「フォームが実際に送信できる」ことを検証していたテストが **どの層にも無かった**。
 * `e2e/authenticated/customer/reservation-flow.spec.ts` は日時ステップの表示までで
 * 止まり、`__tests__/integration/actions/public/reservation.test.ts` は FormData を
 * テスト側で組み立てるため、**ブラウザが実際に送る FormData** は誰も見ていない。
 *
 * この隙間が問題になりかけたのが PR #1763 → #1765。Turnstile widget が hidden input を
 * 出すようになり、自前でトークン欄を描画している予約フォームと同名フィールドが
 * 二重になりうる状態が main に入った（FormData が配列化すると
 * `publicReservationSchema` の `z.string().optional()` が送信を弾く）。
 * type-check / lint / unit / build はすべて緑のまま通過しており、
 * **送信を実際に行う層だけが検出できる**類の壊れ方だった。
 *
 * 広域 E2E（`e2e/public/`）は opt-in で毎 push は走らないため、核心導線である
 * ゲスト予約の生存確認は required gate（chromium-smoke）に置く。
 *
 * ## 意図的に含めないもの
 *
 * 異常系・決済・マイページ反映は対象外（それぞれ integration / 広域 E2E が担保）。
 * smoke は全 push を遅くするため happy path 1 本に絞る。
 */

/** `checkBotHeuristics` の MIN_FORM_FILL_TIME_MS (=3000ms) を上回るバッファ。 */
const FORM_FILL_MIN_MS = 3100;

/**
 * 予約 action は成功時に `/reservation/complete` へ PRG リダイレクトする
 * （`src/app/(public)/_shared/actions/reservation.ts`）。Stripe Checkout へは
 * 飛ばないので、smoke でも決済に依存せず完了まで到達できる。
 */
const COMPLETE_URL = /\/reservation\/complete/u;

function enabled(page: Page, scope: ReturnType<Page["getByRole"]>) {
  return scope.getByRole("button").and(page.locator(":enabled"));
}

test.describe("ゲスト予約 - 送信 happy path", () => {
  // 予約作成は他 spec の seed 前提を壊さない（新規行を足すだけ）ため直列化は不要。
  test.describe.configure({ retries: 0, timeout: 120_000 });

  test.skip(
    process.env["APP_SURFACE"] === "admin",
    "公開サイトの導線なので public surface でのみ検証する",
  );

  test("スペース詳細から予約を作成し、完了ページへ到達する", async ({
    page,
  }) => {
    await page.goto(
      `${urls.spaces}/${spaceFixtures.publicReservableSpaceSlug}`,
    );
    await page
      .getByRole("main")
      .getByRole("link", { name: "Reserve this space" })
      .click();
    await expect(page).toHaveURL(/\/reservation\?spaceId=/u, {
      timeout: 20_000,
    });

    // --- Step 2: 日時選択 -----------------------------------------------
    const dateTime = page.getByRole("group", { name: "日時選択" });
    await expect(dateTime).toBeVisible({ timeout: 20_000 });

    // 当日は営業時間の経過で開始枠が減るため、数日先の予約可能日を選ぶ。
    await enabled(page, dateTime.getByRole("gridcell")).nth(3).click();

    await enabled(page, page.getByRole("group", { name: "開始時間を選択" }))
      .first()
      .click();
    await enabled(page, page.getByRole("group", { name: "利用時間を選択" }))
      .first()
      .click();

    await page.getByRole("button", { name: "次へ" }).click();
    await expect(page).toHaveURL(/step=3/u, { timeout: 20_000 });

    // --- Step 3: 情報入力 -----------------------------------------------
    const main = page.getByRole("main");
    const mountedAt = Date.now();

    // ラベルには必須バッジ等が同居するため、`getByLabel` ではなくアクセシブル名で掴む。
    await main.getByRole("textbox", { name: "姓", exact: true }).fill("山田");
    await main.getByRole("textbox", { name: "名", exact: true }).fill("太郎");
    await main
      .getByRole("textbox", { name: "メールアドレス", exact: true })
      .fill(uniqueEmail("e2e-smoke-rsv"));

    // 必須規約（RESERVATION scope）は seed 次第で 0 件にも複数にもなる。
    const consents = main.getByRole("checkbox");
    const consentCount = await consents.count();
    for (let i = 0; i < consentCount; i++) {
      await consents.nth(i).check();
    }

    // Turnstile は E2E テストキー（always passes）で自動解決し、widget 自身が
    // hidden input を埋める。**stub しない** — 実際に送られる FormData を
    // 検証することがこの spec の目的そのもの。
    await expect(page.locator('input[name="turnstileToken"]')).not.toHaveValue(
      "",
      { timeout: 20_000 },
    );

    const submit = main.getByRole("button", { name: "予約を確定する" });
    await expect(submit).toBeEnabled({ timeout: 20_000 });

    // bot heuristic (`checkBotHeuristics`) の下限を満たす。
    // page.waitForTimeout は ESLint で禁止のため Node の setTimeout を使う。
    const elapsed = Date.now() - mountedAt;
    if (elapsed < FORM_FILL_MIN_MS) {
      await new Promise((resolve) => {
        setTimeout(resolve, FORM_FILL_MIN_MS - elapsed);
      });
    }

    await submit.click();

    await expect(page).toHaveURL(COMPLETE_URL, { timeout: 30_000 });
    await expect(
      page.getByRole("heading", { name: "ご予約ありがとうございます" }),
    ).toBeVisible({ timeout: 20_000 });
  });
});
