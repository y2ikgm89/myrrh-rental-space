import { test, expect, type Page } from "../fixtures/e2e-test";
import { spaceFixtures, uniqueEmail, urls } from "../fixtures";
import { pickBookableDateInNextMonth } from "../helpers/reservation-date";
import { visibleById } from "../helpers/streaming-safe-locators";
import {
  acquireTurnstileToken,
  TURNSTILE_LOAD_ACTION_TIMEOUT_MS,
  TURNSTILE_TOKEN_ATTEMPT_TIMEOUT_MS,
  TURNSTILE_TOKEN_MAX_ATTEMPTS,
} from "../helpers/turnstile";

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
 * ## Turnstile の stall をこの test の中で吸収する
 *
 * Turnstile は **stub しない**（実際に送られる FormData を検証することがこの spec の
 * 目的そのもの）。ところが CI では稀に、widget が render されているのに challenge が
 * 一度も来ず hidden input が永久に空のままになる。その document は自己回復しないので、
 * 待ちを延ばしても救えない（分布と実測は `e2e/helpers/turnstile.ts` の docstring）。
 *
 * この spec は `test.describe.configure({ retries: 0 })` で CI の `retries: 2` を
 * 捨てているため汎用のリトライに救われず、しかも**毎 push の required gate**なので
 * 踏むと全 PR が止まる。よってトークン取得は `acquireTurnstileToken` に委ね、
 * stall を検出したらウィザードごと開き直す（`loadAndFillForm`）。
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
 * （`.claude/rules/testing-e2e.md`「test 本体を timeout させない」）。
 */
const STEP_TIMEOUT_MS = 20_000;

/** 送信 → Server Action 往復 → 完了ページへの PRG リダイレクト。 */
const SUBMIT_TIMEOUT_MS = 30_000;

function enabled(page: Page, scope: ReturnType<Page["getByRole"]>) {
  return scope.getByRole("button").and(page.locator(":enabled"));
}

/**
 * スペース詳細 → step 2（日時選択）→ step 3（情報入力・規約同意）までを
 * **まっさらな状態から**やり直す。
 *
 * `acquireTurnstileToken` は Turnstile の stall を検出するとページごと作り直すため、
 * この関数は何度呼ばれても同じ結果になるよう `goto` から始める。リロードすると
 * ウィザードの選択（reducer 上の日付・時間帯）も step 3 の入力も消えるので、
 * やり直しの全工程をここに含める。
 */
async function loadAndFillForm(
  page: Page,
  dateOnly: string,
  email: string,
): Promise<void> {
  await page.goto(`${urls.spaces}/${spaceFixtures.publicReservableSpaceSlug}`, {
    timeout: STEP_TIMEOUT_MS,
  });
  await page
    .getByRole("main")
    .getByRole("link", { name: "Reserve this space" })
    .click();
  await expect(page).toHaveURL(/\/reservation\?spaceId=/u, {
    timeout: STEP_TIMEOUT_MS,
  });

  // --- Step 2: 日時選択 -----------------------------------------------
  const dateTime = page.getByRole("group", { name: "日時選択" });
  await expect(dateTime).toBeVisible({ timeout: STEP_TIMEOUT_MS });

  // 翌月へ送る。DayPicker は `<nav>`（role="navigation"）に前月 → 翌月の順で
  // 2 ボタンを描く（`react-day-picker` の `components/Nav.js`）。aria-label は
  // locale に従って翻訳される（実測「次の月へ」）ので、名前ではなく構造で掴む。
  //
  // **`click()` ではなく `press("Enter")` を使う。** click は hit-target check
  // （"element receives pointer events"）を通すため、カレンダーの上に重なる要素が
  // あると永久に retry する。実測 run 30736160628: sticky な `<header
  // role="banner">` と DayPicker 自身の `.rdp-month_caption` が交互に pointer
  // events を奪い、120 秒の test timeout まで 60 回以上 retry して失敗した。
  // `press` は focus + keydown/keyup だけで **actionability チェックを一切
  // 行わない**（公式 `types.d.ts`: "press fires keydown+keyup on the focused
  // element; no actionability checks"）ので hit-target に阻まれない。`<button>`
  // への Enter はネイティブに click を発火する。
  //
  // 代わりに**可視性は自分で待つ**。actionability を見ない以上、描画前の要素に
  // キーを送ってしまわないよう web-first assertion を前に置く。
  const calendar = visibleById(page, "reservation-calendar");
  const nextMonth = calendar.getByRole("navigation").getByRole("button").last();
  await expect(nextMonth).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  await nextMonth.press("Enter");

  // DayPicker がセルに付ける安定属性 `data-day` で選ぶ。アクセシブルネームは
  // ロケール依存の長い書式（例「2026年9月8日火曜日」）なので使わない。
  // 可視になるまで待つことが「月送りが効いた」ことの確認も兼ねる。
  const targetDay = calendar
    .locator(`[data-day="${dateOnly}"]`)
    .getByRole("button");
  await expect(targetDay).toBeVisible({ timeout: STEP_TIMEOUT_MS });
  await targetDay.press("Enter");

  await enabled(page, page.getByRole("group", { name: "開始時間を選択" }))
    .first()
    .click();
  await enabled(page, page.getByRole("group", { name: "利用時間を選択" }))
    .first()
    .click();

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page).toHaveURL(/step=3/u, { timeout: STEP_TIMEOUT_MS });

  // --- Step 3: 情報入力 -----------------------------------------------
  const main = page.getByRole("main");

  // ラベルには必須バッジ等が同居するため、`getByLabel` ではなくアクセシブル名で掴む。
  await main.getByRole("textbox", { name: "姓", exact: true }).fill("山田");
  await main.getByRole("textbox", { name: "名", exact: true }).fill("太郎");
  await main
    .getByRole("textbox", { name: "メールアドレス", exact: true })
    .fill(email);

  // 必須規約（RESERVATION scope）は seed 次第で 0 件にも複数にもなる。
  const consents = main.getByRole("checkbox");
  const consentCount = await consents.count();
  for (let i = 0; i < consentCount; i++) {
    await consents.nth(i).check();
  }
}

/**
 * `loadAndFillForm` 1 回ぶんの最悪ケース。**手書きの数値を置かない** —— 関数内の
 * bounded な待ちを 1 本ずつ数え上げる。待ちを足したらここにも足す。
 */
/**
 * click / press / fill / check が 1 つ上限に達したときの追加分。
 *
 * これらは `{ timeout }` を個別に持たない。`acquireTurnstileToken` が page の既定
 * action timeout として一括で縛る（縛らないと 1 回の遅い操作が test 本体の予算を
 * 食い潰し、この **required gate** が固まったまま数分報告しない、Codex #2072 の指摘）。
 *
 * **全 13 アクションぶんを合算はしない。** 1 つでも上限に達した時点で例外が伝播して
 * test はそこで終わるので、上限に達しうるのは高々 1 回。合算すると required gate の
 * timeout が 10 分になり、報告がかえって遅くなる。
 */
const LOAD_BOUND_SLACK_MS = TURNSTILE_LOAD_ACTION_TIMEOUT_MS;

const LOAD_WORST_CASE_MS =
  STEP_TIMEOUT_MS + // goto: スペース詳細
  STEP_TIMEOUT_MS + // 予約ウィザードへの遷移確定
  STEP_TIMEOUT_MS + // step 2「日時選択」group の可視化
  STEP_TIMEOUT_MS + // 月送りボタンの可視化
  STEP_TIMEOUT_MS + // 対象日セルの可視化
  STEP_TIMEOUT_MS + // step=3 への遷移確定
  LOAD_BOUND_SLACK_MS;

/**
 * トークン取得の最悪ケース。`acquireTurnstileToken` は attempt ごとに `load()` から
 * やり直すので、ウィザードを埋め直す予算も attempt 回数ぶん掛かる。
 */
const ACQUIRE_TOKEN_WORST_CASE_MS =
  TURNSTILE_TOKEN_MAX_ATTEMPTS *
  (LOAD_WORST_CASE_MS + TURNSTILE_TOKEN_ATTEMPT_TIMEOUT_MS);

/**
 * 内部待機の最悪ケース合計。**手書きの数値を置かない** —— 旧 `120_000` は
 * `loadAndFillForm` を 2 回走らせうる形にした時点で最悪ケースに届かなくなる。
 *
 * 本体を timeout させないことは `.claude/rules/testing-e2e.md` の要求
 * （timeout すると page ごと閉じられ、失敗時の screenshot / trace も失われる）。
 * ここが定数から導出されていれば、待ちを 1 つ足したときに自動で追随する。
 *
 * 正常時の実測は 10 数秒（トークン取得は 1〜2 秒）で、この上限は Turnstile が
 * 全 attempt で stall したときにだけ消費される。
 */
const TEST_TIMEOUT_MS =
  ACQUIRE_TOKEN_WORST_CASE_MS +
  STEP_TIMEOUT_MS + // 送信ボタンの有効化
  FORM_FILL_MIN_MS +
  SUBMIT_TIMEOUT_MS + // 完了ページへの PRG リダイレクト
  STEP_TIMEOUT_MS; // 完了見出しの可視化

test.describe("ゲスト予約 - 送信 happy path", () => {
  // 予約作成は他 spec の seed 前提を壊さない（新規行を足すだけ）ため直列化は不要。
  //
  // `retries: 0` を維持する結果として **CI の `retries: 2` はこの spec に効かない**。
  // Turnstile の stall はその外側の retry ではなく `acquireTurnstileToken` の
  // ページ再作成で吸収する。
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
    // 作り直したら基準も取り直さなければならない。`load()` の完了時刻は必ず
    // その document の `formRenderedAt` より後なので、ここから待てば足りる。
    let lastLoadedAt = 0;

    // Turnstile は E2E テストキー（always passes）で自動解決し、widget 自身が
    // hidden input を埋める。challenge が一度も来ない document は自己回復しないため、
    // そのときはウィザードごと開き直す（`e2e/helpers/turnstile.ts`）。まだ submit 前で
    // 予約レコードを 1 件も作らないので、作り直しても検証対象は変わらない。
    await acquireTurnstileToken(page, {
      load: async () => {
        await loadAndFillForm(page, dateOnly, email);
        lastLoadedAt = Date.now();
      },
    });

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
