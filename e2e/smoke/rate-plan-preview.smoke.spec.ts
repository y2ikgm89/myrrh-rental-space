import { test, expect } from "../fixtures/e2e-test";
import {
  bookableDateClockTime,
  pickBookableDate,
} from "../helpers/reservation-date";
import { gotoDateTimeStepByUrl } from "../helpers/reservation-wizard";
import { visibleById } from "../helpers/streaming-safe-locators";
import { installFixedDate } from "../helpers/fixed-date";

/**
 * Smoke: 予約プレビュー - 週末料金プラン反映（Task 16）
 *
 * Space 詳細ページ → 予約フォームで「金曜 19:00-21:00」を選択し、料金プレビューに
 * `coworking-space` の週末料金プラン（`prisma/seed.ts` の `seedSpaceRatePlans`、
 * `e2e/fixtures/test-data.ts` の `ratePlanFixtures.weekendPlanName` と契約）が
 * 反映されることを検証する。公開予約 UI はプラン名自体を表示しないため（内部実装の
 * 詳細）、「反映されている」ことは金額そのものをロックダウンして証明する:
 *
 *   週末料金プラン: daysOfWeek=[FRIDAY,SATURDAY,SUNDAY], holidayMode="ANY",
 *   hourlyPrice = round(coworking-space.hourlyPrice(500) * 1.3) = 650
 *   → 2 時間分の base price = 650 * 2 = 1,300
 *   → 標準税率 10%・tax_included 表示（Settings 既定）で
 *     totalPriceWithTax = round(1,300 * 1.1) = 1,430 → 「¥1,430（税込）」
 *
 * 祝日料金プラン（holidayMode="ONLY"、last-updated-wins で週末料金より優先され得る）
 * と競合しないよう、選択日は日本の祝日ではない金曜日を実行時に動的選定する。
 * `prisma/seed.ts` の `seedReservations` はデモ予約を実行時点から最大 +30 日の
 * 範囲にのみ生成するため、それより十分先の日付を選んで衝突を避ける。
 *
 * Playwright project: chromium-smoke（公開・未認証・setup 非依存のため
 * この project に適合）。
 *
 * CalendarPicker は ReservationFormSection 経由で `E2E_FIXED_NOW_ISO` を
 * 消費するため、`installFixedDate` と SSR の minDate 計算が整合する
 * （**タイマーは止めない**。理由は `e2e/helpers/fixed-date.ts`）。
 *
 * 解消済みの過去の既知問題（Task 16 follow-up fix）: 以前は
 * `e2e/authenticated/admin/space-rate-plan-crud.spec.ts` がこの spec と同一の
 * `coworking-space` を対象にしており、CRUD 側の `updateTag` とこの spec の
 * キャッシュ読み取りが同一タグ上で競合して、CI `workers: 2` の並列実行時に
 * 下記の価格アサーションが 15〜30 秒超まで遅延する flake（8 回中 7 回再現）が
 * 起きていた。CRUD spec の対象を別 Space
 * （`spaceFixtures.adminRatePlanCrudTargetSlug` = seminar-room）へ移して解消済み。
 * その後、監査 A-02 で rate plan の読み取り自体がキャッシュを持たなくなったため、
 * この競合は構造的にも起こらなくなった（Space の分離はそのまま維持する）。
 */

/** 週末料金プランが適用される曜日（`ratePlanFixtures.weekendPlanName` の daysOfWeek）。 */
const FRIDAY = 5;

/** ウィザードへ入るまでの 1 待ちあたりの上限。 */
const STEP_TIMEOUT_MS = 15_000;

test.describe("smoke: 予約プレビュー - 週末料金プラン反映", () => {
  test("金曜 19:00-21:00 を選択すると週末料金がプレビュー価格に反映される", async ({
    page,
  }) => {
    // 週末料金プランの検証なので金曜に固定する。導出規則は `pickBookableDate`
    // （seed のデモ予約帯を避け、日曜休業と日本の祝日を除外する）。
    const dateOnly = pickBookableDate({ weekday: FRIDAY });
    // 12:00 JST（= 03:00 UTC）固定。既存 spec（events-calendar.spec.ts）と同じ
    // anchor 時刻を使い、ホスト側タイムゾーンに起因する日付境界のずれを避ける。
    // page.goto より前に呼ぶ（SSR の minDate と client の「今日」を揃えるため）。
    await installFixedDate(page, bookableDateClockTime(dateOnly));

    // CTA は **クリックせず** href をたどってフル遷移する。固定時計の下では
    // client 遷移が確定しないことがあり、この spec が 2 度それで落ちている
    // （理由と実測は `gotoDateTimeStepByUrl` の docstring）。
    await gotoDateTimeStepByUrl(page, { stepTimeoutMs: STEP_TIMEOUT_MS });

    // 日付: 動的に選んだ非祝日の金曜（クロック固定により「今日」= 月送り不要）。
    // アクセシブルネームはロケール依存の長いフォーマット（例:
    // "2026年8月21日金曜日" または "Today, ..."）になるため、DayPicker が
    // 各セルに付与する安定した `data-day="YYYY-MM-DD"` 属性でスコープしてから
    // getByRole で実際のボタンをクリックする。
    const calendar = visibleById(page, "reservation-calendar");
    await calendar
      .locator(`[data-day="${dateOnly}"]`)
      .getByRole("button")
      .click();

    // 開始時刻 19:00
    const timeSlots = visibleById(page, "reservation-time-slots");
    await timeSlots.getByRole("button", { name: "19:00", exact: true }).click();

    // 利用時間 2 時間（→ 終了 21:00）
    const duration = visibleById(page, "reservation-duration");
    await duration.getByRole("button", { name: "2時間", exact: true }).click();

    const nextButton = page.getByRole("button", { name: "次へ" });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    await expect(page).toHaveURL(/[?&]step=3/u);

    // 予約内容サマリー（BookingSummary）の価格表示をロックダウンする。
    // ¥1,300（基本料金）ではなく ¥1,430（税込）になっていることが、週末料金
    // プラン（650円/時間）が基本時間料金（500円/時間）ではなく適用された証拠。
    // この価格は `fetchReservationPricingPreview` Server Action 経由で
    // `getSpaceRatePlans` を読む。この読み取りはキャッシュを持たない（監査 A-02）
    // ため、admin 側の料金プラン CRUD と並列に走っても待たされない。既定の
    // assertion timeout（5000ms）で足りる。
    const bookingSummaryHeader = page
      .getByRole("heading", { level: 3, name: "予約内容" })
      .locator("..");
    await expect(bookingSummaryHeader).toContainText("¥1,430（税込）");
  });
});
