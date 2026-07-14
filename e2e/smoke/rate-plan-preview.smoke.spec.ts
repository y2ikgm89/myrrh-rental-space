import { test, expect } from "@playwright/test";
import * as holidayJp from "@holiday-jp/holiday_jp";
import { spaceFixtures, urls } from "../fixtures";

/**
 * Smoke: 予約プレビュー - 週末料金プラン反映（Task 16）
 *
 * Space 詳細ページ → 予約フォームで「金曜 19:00-21:00」を選択し、料金プレビューに
 * `coworking-space` の週末料金プラン（`prisma/seed.ts` の `seedSpaceRatePlans`、
 * `e2e/fixtures/test-data.ts` の `ratePlanFixtures.weekendPlanName` と契約）が
 * 反映されることを検証する。公開予約 UI はプラン名自体を表示しないため（内部実装の
 * 詳細）、「反映されている」ことは金額そのものをロックダウンして証明する:
 *
 *   週末料金プラン: daysOfWeek=[FRIDAY,SATURDAY,SUNDAY], holidayMode="any",
 *   hourlyPrice = round(coworking-space.hourlyPrice(500) * 1.3) = 650
 *   → 2 時間分の base price = 650 * 2 = 1,300
 *   → 標準税率 10%・tax_included 表示（Settings 既定）で
 *     totalPriceWithTax = round(1,300 * 1.1) = 1,430 → 「¥1,430（税込）」
 *
 * 祝日料金プラン（holidayMode="only"、last-updated-wins で週末料金より優先され得る）
 * と競合しないよう、選択日は日本の祝日ではない金曜日を実行時に動的選定する。
 * `prisma/seed.ts` の `seedReservations` はデモ予約を実行時点から最大 +30 日の
 * 範囲にのみ生成するため、それより十分先の日付を選んで衝突を避ける。
 *
 * Playwright project: chromium-smoke（`.claude/skills/e2e-authoring` の
 * 配置ルール — 公開・未認証・setup 非依存のためこの project に適合）。
 */

const SEED_RESERVATION_MAX_DAYS_OFFSET = 30; // prisma/seed.ts seedReservations() の最大 daysOffset
const SAFETY_MARGIN_DAYS = 5;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function addUtcDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

function formatUtcDateOnly(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 実行時点から十分先（seed のデモ予約と衝突しない）かつ日本の祝日ではない
 * 金曜日の "YYYY-MM-DD" を返す。カレンダー UI はこの日を `page.clock.install` で
 * 「今日」に固定するため、月送り操作なしで選択できる。
 */
function pickNonHolidayFriday(): string {
  const now = new Date();
  let candidate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  candidate = addUtcDays(
    candidate,
    SEED_RESERVATION_MAX_DAYS_OFFSET + SAFETY_MARGIN_DAYS,
  );

  const daysUntilFriday = (5 - candidate.getUTCDay() + 7) % 7;
  candidate = addUtcDays(candidate, daysUntilFriday);

  while (holidayJp.isHoliday(formatUtcDateOnly(candidate))) {
    candidate = addUtcDays(candidate, 7); // 翌週の同じ金曜へ
  }

  return formatUtcDateOnly(candidate);
}

test.describe("smoke: 予約プレビュー - 週末料金プラン反映", () => {
  test("金曜 19:00-21:00 を選択すると週末料金がプレビュー価格に反映される", async ({
    page,
  }) => {
    const dateOnly = pickNonHolidayFriday();
    // 12:00 JST（= 03:00 UTC）固定。既存 spec（events-calendar.spec.ts）と同じ
    // anchor 時刻を使い、ホスト側タイムゾーンに起因する日付境界のずれを避ける。
    // page.goto より前に呼ぶ（時刻凍結の規約）。
    await page.clock.install({ time: new Date(`${dateOnly}T03:00:00.000Z`) });

    await page.goto(
      `${urls.spaces}/${spaceFixtures.publicReservableSpaceSlug}`,
    );
    await expect(page).toHaveURL(
      new RegExp(`/spaces/${spaceFixtures.publicReservableSpaceSlug}$`, "u"),
    );

    const reserveButton = page
      .locator("#main-content")
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
    const calendar = page.locator("#reservation-calendar");
    await calendar
      .locator(`[data-day="${dateOnly}"]`)
      .getByRole("button")
      .click();

    // 開始時刻 19:00
    const timeSlots = page.locator("#reservation-time-slots");
    await timeSlots.getByRole("button", { name: "19:00", exact: true }).click();

    // 利用時間 2 時間（→ 終了 21:00）
    const duration = page.locator("#reservation-duration");
    await duration.getByRole("button", { name: "2時間", exact: true }).click();

    const nextButton = page.getByRole("button", { name: "次へ" });
    await expect(nextButton).toBeEnabled();
    await nextButton.click();

    await expect(page).toHaveURL(/[?&]step=3/u);

    // 予約内容サマリー（BookingSummary）の価格表示をロックダウンする。
    // ¥1,300（基本料金）ではなく ¥1,430（税込）になっていることが、週末料金
    // プラン（650円/時間）が基本時間料金（500円/時間）ではなく適用された証拠。
    const bookingSummaryHeader = page
      .getByRole("heading", { level: 3, name: "予約内容" })
      .locator("..");
    await expect(bookingSummaryHeader).toContainText("¥1,430（税込）");
  });
});
