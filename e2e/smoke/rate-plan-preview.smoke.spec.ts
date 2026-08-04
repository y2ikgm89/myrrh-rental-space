import { test, expect } from "../fixtures/e2e-test";
import { spaceFixtures, urls } from "../fixtures";
import {
  bookableDateClockTime,
  pickBookableDate,
} from "../helpers/reservation-date";
import { visibleById } from "../helpers/streaming-safe-locators";

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
 * Playwright project: chromium-smoke（`.claude/skills/e2e-authoring` の
 * 配置ルール — 公開・未認証・setup 非依存のためこの project に適合）。
 *
 * CalendarPicker は ReservationFormSection 経由で `E2E_FIXED_NOW_ISO` を
 * 消費するため、page.clock.install と SSR の minDate 計算が整合する。
 *
 * 解消済みの過去の既知問題（Task 16 follow-up fix）: 以前は
 * `e2e/authenticated/admin/space-rate-plan-crud.spec.ts` がこの spec と同一の
 * `coworking-space` を対象にしており、CRUD の create/update/delete が呼ぶ
 * `updateTag(SPACE_RATE_PLANS(spaceId))` とこの spec の `"use cache"` 読み取りが
 * 同一タグ上で競合し、CI `workers: 2` の並列実行時に下記の価格アサーションが
 * 15〜30 秒超まで遅延する flake（8 回中 7 回再現）が発生していた。CRUD spec の
 * 対象を別 Space（`spaceFixtures.adminRatePlanCrudTargetSlug` =
 * seminar-room。cache tag は spaceId キーのため構造的に別タグ）へ移し解消した。
 */

/** 週末料金プランが適用される曜日（`ratePlanFixtures.weekendPlanName` の daysOfWeek）。 */
const FRIDAY = 5;

test.describe("smoke: 予約プレビュー - 週末料金プラン反映", () => {
  test("金曜 19:00-21:00 を選択すると週末料金がプレビュー価格に反映される", async ({
    page,
  }) => {
    // 週末料金プランの検証なので金曜に固定する。導出規則は `pickBookableDate`
    // （seed のデモ予約帯を避け、日曜休業と日本の祝日を除外する）。
    const dateOnly = pickBookableDate({ weekday: FRIDAY });
    // 12:00 JST（= 03:00 UTC）固定。既存 spec（events-calendar.spec.ts）と同じ
    // anchor 時刻を使い、ホスト側タイムゾーンに起因する日付境界のずれを避ける。
    // page.goto より前に呼ぶ（時刻凍結の規約）。
    await page.clock.install({ time: bookableDateClockTime(dateOnly) });

    await page.goto(
      `${urls.spaces}/${spaceFixtures.publicReservableSpaceSlug}`,
    );
    await expect(page).toHaveURL(
      new RegExp(`/spaces/${spaceFixtures.publicReservableSpaceSlug}$`, "u"),
    );

    const reserveButton = page
      .getByRole("main")
      .getByRole("link", { name: "Reserve this space" });
    await expect(reserveButton).toBeVisible({ timeout: 5000 });
    await reserveButton.click();

    await expect(page).toHaveURL(/\/reservation\?spaceId=[^&]+$/u, {
      timeout: 15000,
    });
    await expect(page.getByRole("group", { name: "日時選択" })).toBeVisible({
      timeout: 15000,
    });

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
    // `getSpaceRatePlans`（'use cache' + cacheTag `SPACE_RATE_PLANS(coworking-space)`）
    // を読む。かつては `space-rate-plan-crud.spec.ts`（chromium-admin）が同じ
    // spaceId を対象にしており、CI `workers: 2` の並列実行下でこのタグの
    // 書込（updateTag）と読取が競合していた（ファイル冒頭コメント参照）。CRUD spec
    // の対象を別 Space（spaceId が異なる = 別タグ）へ移して解消したため、既定の
    // assertion timeout（5000ms）に戻している。
    const bookingSummaryHeader = page
      .getByRole("heading", { level: 3, name: "予約内容" })
      .locator("..");
    await expect(bookingSummaryHeader).toContainText("¥1,430（税込）");
  });
});
