import { test, expect, type Page } from "../fixtures/e2e-test";
import { uniqueEmail } from "../fixtures";
import { pickBookableDateInNextMonth } from "../helpers/reservation-date";
import {
  advanceToDetailsStep,
  fillGuestDetails,
  gotoDateTimeStep,
  RESERVATION_WIZARD_STEP_COUNT,
} from "../helpers/reservation-wizard";

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
 * ## Turnstile
 *
 * `api.js` は `e2e/fixtures/turnstile-stub.ts` がローカル実装へ差し替える。
 * widget の mount と同時に hidden input が埋まるので、この spec は
 * 「トークンが来るのを待つ」という工程を持たない。差し替わるのは Cloudflare の
 * script だけで、widget → hidden input → FormData の配線は実物のまま検証される。
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

/**
 * 遷移確定・要素の可視化 1 本あたりの上限。
 *
 * `goto` にも明示的に渡す —— Playwright Test の `navigationTimeout` / `actionTimeout`
 * は既定 0（無制限）で、遅い 1 回が test 本体の予算を丸ごと食い潰しうる
 * （「test 本体を timeout させない」）。
 */
const STEP_TIMEOUT_MS = 20_000;

/** 送信 → Server Action 往復 → 完了ページへの PRG リダイレクト。 */
const SUBMIT_TIMEOUT_MS = 30_000;

/**
 * スペース詳細 → step 2（日時選択）→ step 3（情報入力・規約同意）までを通す。
 * 操作列そのものは `e2e/helpers/reservation-wizard.ts` が持つ（a11y スキャンと共有）。
 */
async function loadAndFillForm(
  page: Page,
  dateOnly: string,
  email: string,
): Promise<void> {
  const options = { stepTimeoutMs: STEP_TIMEOUT_MS };
  await gotoDateTimeStep(page, options);
  await advanceToDetailsStep(page, { ...options, dateOnly });
  await fillGuestDetails(page, { email });
}

/**
 * `loadAndFillForm` 1 回ぶんの最悪ケース。**手書きの数値を置かない** ——
 * ウィザードが持つ bounded な待ちの本数はヘルパー側の定数から取る。
 */
const LOAD_WORST_CASE_MS = RESERVATION_WIZARD_STEP_COUNT * STEP_TIMEOUT_MS;

/**
 * 内部待機の最悪ケース合計。**手書きの数値を置かない** —— 待ちを 1 つ足したときに
 * 自動で追随する形にしておく。
 *
 * 本体を timeout させないことは E2E の要求
 * （timeout すると page ごと閉じられ、失敗時の screenshot / trace も失われる）。
 */
const TEST_TIMEOUT_MS =
  LOAD_WORST_CASE_MS +
  STEP_TIMEOUT_MS + // 送信ボタンの有効化
  FORM_FILL_MIN_MS +
  SUBMIT_TIMEOUT_MS + // 完了ページへの PRG リダイレクト
  STEP_TIMEOUT_MS; // 完了見出しの可視化

test.describe("ゲスト予約 - 送信 happy path", () => {
  // 予約作成は他 spec の seed 前提を壊さない（新規行を足すだけ）ため直列化は不要。
  //
  // `retries: 0` を維持する結果として **CI の `retries: 2` はこの spec に効かない**。
  // 外部依存はもう無いので、落ちたら実装かこの spec のどちらかが壊れている。
  test.describe.configure({ retries: 0, timeout: TEST_TIMEOUT_MS });

  test.skip(
    process.env["APP_SURFACE"] === "admin",
    "公開サイトの導線なので public surface でのみ検証する",
  );

  test("スペース詳細から予約を作成し、完了ページへ到達する", async ({
    page,
  }) => {
    // 日付は**翌月の最初の予約可能日**を実時刻から導出する。
    //
    // 位置指定（旧実装の `.nth(3)`）は使えない: カレンダーの過去日判定は
    // `E2E_FIXED_NOW_ISO`（2026-07-04 固定）基準で 8 月以降を一切無効化しないのに、
    // `publicReservationSchema` の日付 refine は**実時刻**で走る。位置は動かないまま
    // 実日付だけが進むので、月の 4 営業日目を過ぎた時点から月末まで必ず弾かれる。
    //
    // かといって**時計は固定できない**。`ReservationForm` は
    // `useState(() => Date.now())` で `formRenderedAt` をフォームの初回マウント時に
    // 焼き込み、`checkBotHeuristics` がサーバーの実時刻と引き算する。未来へ固定すると
    // 差が負になり全送信が bot 判定で落ちる（実測 run 30731786539）。
    //
    // よって実時刻のまま、カレンダーを**常に 1 回だけ翌月へ送る**。翌月は全体が
    // 未来なので条件分岐なしに必ず選べる（条件付きロケーターは ESLint で禁止）。
    const dateOnly = pickBookableDateInNextMonth();
    const email = uniqueEmail("e2e-smoke-rsv");

    // bot heuristic の基準時刻。`formRenderedAt` は各 document の
    // `ReservationForm` マウント時にブラウザ時計から焼かれるので、ページを
    // bot heuristic の基準時刻。サーバーは `formRenderToken` の発行時刻から測るので、
    // フォームを埋め終えた時刻から待てば必ず足りる。
    await loadAndFillForm(page, dateOnly, email);
    const lastLoadedAt = Date.now();

    const main = page.getByRole("main");
    const submit = main.getByRole("button", { name: "予約を確定する" });
    await expect(submit).toBeEnabled({ timeout: STEP_TIMEOUT_MS });

    // bot heuristic (`checkBotHeuristics`) の下限を満たす。
    // page.waitForTimeout は ESLint で禁止のため Node の setTimeout を使う。
    const elapsed = Date.now() - lastLoadedAt;
    if (elapsed < FORM_FILL_MIN_MS) {
      await new Promise((resolve) => {
        setTimeout(resolve, FORM_FILL_MIN_MS - elapsed);
      });
    }

    await submit.click();

    await expect(page).toHaveURL(COMPLETE_URL, { timeout: SUBMIT_TIMEOUT_MS });
    await expect(
      page.getByRole("heading", { name: "ご予約ありがとうございます" }),
    ).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  });
});
