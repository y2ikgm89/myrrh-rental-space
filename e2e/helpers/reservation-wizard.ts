import { expect, type Page } from "../fixtures/e2e-test";
import { spaceFixtures, urls } from "../fixtures";
import { visibleById } from "./streaming-safe-locators";

/**
 * 公開の予約ウィザード（step 2 日時選択 → step 3 情報入力）を進める共有ヘルパー。
 *
 * ## なぜ共有するか
 *
 * この操作列には、CI の実失敗から導いた**非自明な回避**が埋まっている:
 *
 * - 月送りとカレンダーのセルは `click()` ではなく `press("Enter")`。click は
 *   hit-target check を通すため、sticky な `<header role="banner">` と DayPicker の
 *   `.rdp-month_caption` が交互に pointer events を奪って永久に retry する
 *   （run 30736160628 で 120 秒の test timeout まで 60 回以上 retry した）
 * - セルはアクセシブルネームではなく `data-day` で掴む。名前はロケール依存の
 *   長い書式（「2026年9月8日火曜日」）になる
 * - step 3 の入力はラベルに必須バッジが同居するので `getByLabel` ではなく
 *   アクセシブルネームで掴む
 *
 * これを spec ごとに複製すると、次に hit-target の類で詰まったとき片方だけ直って
 * もう片方が黙って腐る。ウィザードを通る spec は今後も増える（a11y スキャン・
 * 送信 smoke）ので、操作列の SSoT をここに置く。
 *
 * ## 時間予算
 *
 * 各待ちは呼び出し側が渡す `stepTimeoutMs` で縛る。呼び出し側は
 * {@link RESERVATION_WIZARD_STEP_COUNT} を使って test 全体の上限を導出できる
 * （手書きの数値を置かない）。
 */

/** `gotoDateTimeStep` + `advanceToDetailsStep` が持つ bounded な待ちの本数。 */
export const RESERVATION_WIZARD_STEP_COUNT = 6;

function enabledButtonsIn(page: Page, scope: ReturnType<Page["getByRole"]>) {
  return scope.getByRole("button").and(page.locator(":enabled"));
}

export interface ReservationWizardOptions {
  /** 1 つの待ちの上限。 */
  readonly stepTimeoutMs: number;
}

/**
 * スペース詳細 → 予約ウィザード step 2（日時選択）まで進む。
 *
 * 直接 `/reservation?spaceId=<uuid>` へ行かないのは、slug から uuid を引く手段を
 * spec に持たせないため。実際の導線（スペース詳細の CTA）を通るのが確実で、
 * ついでに CTA の生存確認にもなる。
 */
export async function gotoDateTimeStep(
  page: Page,
  options: ReservationWizardOptions,
): Promise<void> {
  const { stepTimeoutMs } = options;

  await page.goto(`${urls.spaces}/${spaceFixtures.publicReservableSpaceSlug}`, {
    timeout: stepTimeoutMs,
  });
  await page
    .getByRole("main")
    .getByRole("link", { name: "Reserve this space" })
    .click();
  await expect(page).toHaveURL(/\/reservation\?spaceId=/u, {
    timeout: stepTimeoutMs,
  });

  await expect(page.getByRole("group", { name: "日時選択" })).toBeVisible({
    timeout: stepTimeoutMs,
  });
}

/**
 * step 2 で日付・開始時刻・利用時間を選び、step 3（情報入力）まで進む。
 *
 * `dateOnly` は `pickBookableDateInNextMonth()` 等で選んだ翌月の営業日。
 * 翌月なので必ず 1 回だけ月送りする。
 */
export async function advanceToDetailsStep(
  page: Page,
  options: ReservationWizardOptions & { readonly dateOnly: string },
): Promise<void> {
  const { stepTimeoutMs, dateOnly } = options;

  // `press` は focus + keydown/keyup だけで **actionability チェックを一切
  // 行わない**（公式 `types.d.ts`: "press fires keydown+keyup on the focused
  // element; no actionability checks"）ので hit-target に阻まれない。`<button>`
  // への Enter はネイティブに click を発火する。
  //
  // 代わりに**可視性は自分で待つ**。actionability を見ない以上、描画前の要素に
  // キーを送ってしまわないよう web-first assertion を前に置く。
  //
  // DayPicker は `<nav>`（role="navigation"）に前月 → 翌月の順で 2 ボタンを描く
  // （`react-day-picker` の `components/Nav.js`）。aria-label は locale に従って
  // 翻訳される（実測「次の月へ」）ので、名前ではなく構造で掴む。
  const calendar = visibleById(page, "reservation-calendar");
  const nextMonth = calendar.getByRole("navigation").getByRole("button").last();
  await expect(nextMonth).toBeVisible({ timeout: stepTimeoutMs });
  await nextMonth.press("Enter");

  const targetDay = calendar
    .locator(`[data-day="${dateOnly}"]`)
    .getByRole("button");
  await expect(targetDay).toBeVisible({ timeout: stepTimeoutMs });
  await targetDay.press("Enter");

  await enabledButtonsIn(
    page,
    page.getByRole("group", { name: "開始時間を選択" }),
  )
    .first()
    .click();
  await enabledButtonsIn(
    page,
    page.getByRole("group", { name: "利用時間を選択" }),
  )
    .first()
    .click();

  await page.getByRole("button", { name: "次へ" }).click();
  await expect(page).toHaveURL(/step=3/u, { timeout: stepTimeoutMs });
}

/**
 * step 3 の必須項目（氏名・メール・必須規約）を埋める。
 *
 * 必須規約（RESERVATION scope）は seed 次第で 0 件にも複数にもなるので数えて回す。
 */
export async function fillGuestDetails(
  page: Page,
  options: { readonly email: string },
): Promise<void> {
  const main = page.getByRole("main");

  // ラベルには必須バッジ等が同居するため、`getByLabel` ではなくアクセシブル名で掴む。
  await main.getByRole("textbox", { name: "姓", exact: true }).fill("山田");
  await main.getByRole("textbox", { name: "名", exact: true }).fill("太郎");
  await main
    .getByRole("textbox", { name: "メールアドレス", exact: true })
    .fill(options.email);

  const consents = main.getByRole("checkbox");
  const consentCount = await consents.count();
  for (let i = 0; i < consentCount; i++) {
    await consents.nth(i).check();
  }
}
