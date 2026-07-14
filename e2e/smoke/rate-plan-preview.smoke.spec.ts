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
 *
 * 既知の限定事項（レビュー Finding 2、`test.info().annotations` にも同旨を記録）:
 * 上記の理由でこの日付は実行時の実時刻を起点に動的算出しており、webServer 共有の
 * `E2E_FIXED_NOW_ISO`（既定 2026-07-04T03:00:00.000Z。`events-calendar.spec.ts` 等
 * 他 spec がこの固定値へ依存しているため webServer 全体の既定値としては変更でき
 * ない）には意図的に揃えていない。加えて予約フォームの `CalendarPicker`
 * （`reservation/_components/calendar-picker.tsx`）は `EventCalendarSection` と
 * 異なり `E2E_RUNTIME`/`E2E_FIXED_NOW_ISO` を消費する opt-in 配線を持たず
 * （リポジトリ全体を grep して確認済み: 予約フローの SSR は素の `new Date()` を
 * 使う）、`page.clock.install` は browser 側のみを凍結する。そのため初回 SSR は
 * サーバーの実時刻、client hydration 後はこの spec が固定したフェイク時刻という
 * SSR/CSR 不一致（hydration-418 サガと同種のクラス）が理論上発生し得る。
 * `CalendarPicker` の `minDate`（`useState(() => new Date())` の lazy initializer）
 * が SSR と hydration とで異なる値になり得るのが具体的な発生源。React の
 * client 側再描画が Playwright の auto-retrying assertion 収束前に完了するため
 * 現状このテストは green だが、根治には `EventCalendarSection` と同型の
 * `initialNowIso` 配線を `CalendarPicker`（および親の Server Component）まで
 * 通す production code 変更が必要であり、test-only fix である本 Task のスコープ外。
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
    // 既知の SSR/CSR 不一致リスク（レビュー Finding 2、詳細はファイル冒頭コメント参照）。
    // CalendarPicker は E2E_RUNTIME/E2E_FIXED_NOW_ISO を消費しないため、下記の
    // page.clock.install は client 側のみを凍結し、初回 SSR は実時刻のまま。
    test.info().annotations.push({
      type: "known-issue",
      description:
        "予約フォームの CalendarPicker は EventCalendarSection と異なり " +
        "E2E_RUNTIME/E2E_FIXED_NOW_ISO の opt-in 配線を持たない。page.clock.install " +
        "は browser のみを凍結するため、初回 SSR（実時刻）と client hydration 後" +
        "（このテストが固定したフェイク時刻）で minDate 計算が乖離する " +
        "hydration-418 サガ同種の SSR/CSR 不一致が理論上発生し得る。React の " +
        "client 側再描画が Playwright の auto-retry 収束前に完了するため現状 " +
        "green。根治には CalendarPicker への initialNowIso 配線（production code " +
        "変更、本 Task のスコープ外）が必要。",
    });

    // 既知の並列実行コンテンション（本 fix の検証run中に新規発見・未解決の残課題、
    // Finding 1/2 とは別件）。詳細は末尾の価格アサーション直前のコメント参照。
    test.info().annotations.push({
      type: "known-issue",
      description:
        "chromium-admin の space-rate-plan-crud.spec.ts と同一 spaceId " +
        "（coworking-space）の 'use cache' タグ（SPACE_RATE_PLANS）を共有するため、" +
        "CI の workers:2 で両 project が並列実行されると、CRUD spec の " +
        "create/update/delete が呼ぶ updateTag() とこのテストの価格プレビュー読み取り" +
        "（'use cache'）が同一タグ上で競合し、末尾の価格アサーションが 15〜30 秒超に " +
        "達することがある（単独実行時は 3 秒台で安定、8 回の検証run中 7 回この" +
        "パターンで concurrent 実行時に timeout/flake を確認）。timeout 引き上げは" +
        "緩和のみで根治ではない。",
    });

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
    // timeout を既定の 5000ms から明示的に伸ばす（検証run中に発見した既知の flake、
    // Finding 1/2 とは別件・未解決の残課題）。この価格は `fetchReservationPricingPreview`
    // Server Action 経由で `getSpaceRatePlans`（'use cache' + cacheTag
    // `SPACE_RATE_PLANS(coworking-space)`）を読む。同じ spaceId に対して
    // `space-rate-plan-crud.spec.ts`（chromium-admin）が create/update/delete の
    // たびに `invalidateSpaceRatePlansCache` → `updateTag()` で同一タグを無効化する
    // ため、CI の `workers: 2` で両 project が並列実行されると、この
    // 書込（updateTag）と読取（'use cache' 読み取り）が同一タグ上で競合し、
    // 実測で 15〜30 秒超に達することがある（単独実行時は 3 秒台で安定）。
    // 15000ms への引き上げは緩和に過ぎず全消去はできていない — 恒久対応には
    // Next.js Cache Components 側の挙動調査、または smoke/CRUD 両 spec が同一
    // spaceId を共有しない構成への変更が要る（本 fix のスコープ外、follow-up 予定）。
    await expect(bookingSummaryHeader).toContainText("¥1,430（税込）", {
      timeout: 15000,
    });
  });
});
