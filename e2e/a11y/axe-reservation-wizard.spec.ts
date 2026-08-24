import { test, expect } from "../fixtures/e2e-test";
import { pickBookableDateInNextMonth } from "../helpers/reservation-date";
import {
  advanceToDetailsStep,
  gotoDateTimeStep,
  RESERVATION_WIZARD_STEP_COUNT,
} from "../helpers/reservation-wizard";
import {
  buildPublicAxeScanner,
  formatAxeViolations,
  isBlockingPublicViolation,
} from "../helpers/public-axe";

/**
 * 予約ウィザード step 2 / step 3 の axe スキャン。
 *
 * ## なぜ別 spec なのか
 *
 * `axe-public-pages.spec.ts` は「URL を開くだけで到達できるページ」を回す。
 * 予約ウィザードの step 2（日時選択）と step 3（情報入力）は**操作しないと
 * 到達できない**ので、そのループには入らない。結果として、公開面で最も
 * インタラクションの多い画面 —— カレンダー（`react-day-picker`）、時間帯の
 * ボタン群、規約同意のチェックボックス、Turnstile ——が **1 度も a11y 検査を
 * 受けていなかった**。
 *
 * ここは a11y の当たりが強い場所でもある。カレンダーは grid の role 構造と
 * キーボード操作、時間帯選択は group とボタンのアクセシブルネーム、フォームは
 * ラベル関連付けと必須表示が絡む。
 *
 * ## 検査対象
 *
 * - **step 2** — 日付・開始時刻・利用時間を選ぶ前の初期状態。カレンダーが
 *   描画された時点で見る（選択後は同じ木に aria-selected が付くだけ）
 * - **step 3** — 情報入力フォーム。**未入力・未同意のまま**見る。エラー表示は
 *   送信して初めて出るので、ここでは「入力前の静的な状態」を対象にする
 *   （送信後のエラー表示の a11y は別の課題。ここで一緒に見ると、この spec が
 *   送信 smoke の二重化になる）
 *
 * ## 前提
 *
 * Turnstile の `api.js` は `e2e/fixtures/turnstile-stub.ts` がローカル実装へ
 * 差し替える。実 widget の iframe は生成されないので、スキャン対象は自分たちの
 * DOM だけになり結果が安定する。
 */

/** 1 つの待ちの上限。ウィザードは描画が重いので公開ページ scan より長く取る。 */
const STEP_TIMEOUT_MS = 20_000;

/** axe のスキャン自体の上限（step ごとに 1 回）。 */
const SCAN_TIMEOUT_MS = 30_000;

const TEST_TIMEOUT_MS =
  RESERVATION_WIZARD_STEP_COUNT * STEP_TIMEOUT_MS + SCAN_TIMEOUT_MS * 2;

test.describe("a11y scan - 予約ウィザード", () => {
  test.describe.configure({ timeout: TEST_TIMEOUT_MS });

  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
  });

  test("step 2（日時選択）と step 3（情報入力）に critical/serious 違反がない", async ({
    page,
  }) => {
    const options = { stepTimeoutMs: STEP_TIMEOUT_MS };

    await gotoDateTimeStep(page, options);

    // 走査が空振りしていないことを先に確かめる。error boundary に差し替わっても
    // URL は同じままなので、**その step 固有のコントロール**が居ることを見る
    // （axe は何を走査しても違反 0 件を返しうる）。
    await expect(
      page.getByRole("grid").or(page.getByRole("application")).first(),
    ).toBeVisible({ timeout: STEP_TIMEOUT_MS });

    const dateTimeResults = await buildPublicAxeScanner(page).analyze();
    expect(
      dateTimeResults.violations.filter(isBlockingPublicViolation),
      `予約ウィザード step 2 a11y violations:\n${formatAxeViolations(dateTimeResults.violations)}`,
    ).toEqual([]);

    await advanceToDetailsStep(page, {
      ...options,
      dateOnly: pickBookableDateInNextMonth(),
    });

    await expect(
      page.getByRole("main").getByRole("textbox", { name: "姓", exact: true }),
    ).toBeVisible({ timeout: STEP_TIMEOUT_MS });

    const detailsResults = await buildPublicAxeScanner(page).analyze();
    expect(
      detailsResults.violations.filter(isBlockingPublicViolation),
      `予約ウィザード step 3 a11y violations:\n${formatAxeViolations(detailsResults.violations)}`,
    ).toEqual([]);
  });
});
