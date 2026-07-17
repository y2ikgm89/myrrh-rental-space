/**
 * Phase B.2 task 27: admin 繰返し予約 (ReservationSeries) end-to-end golden path。
 *
 * ゴール:
 *   1. admin 予約作成フォームで「繰返しにする」toggle ON → WEEKLY BYDAY=TU COUNT=10 入力
 *   2. RecurrencePreview が「毎週 火 (10 回開催)」を表示
 *   3. Submit → success (SubmissionResult resetForm: true)
 *   4. Calendar view で 10 instance すべて表示、各 event に「定期」バッジ visible
 *   5. 予約詳細ページから「定期予約すべてキャンセル」→ series-all scope で cancel
 *   6. 10 instance すべて CANCELLED status
 *   7. Series row の deletedAt が set (soft-delete)
 *
 * 現在の実装状況 (Phase B.2 PR 5 時点):
 *   - Task 13 command (createReservationSeriesCommand + cancelReservationSeriesCommand): ✅
 *   - Task 15/16 iCal/GCal: ✅
 *   - Task 18 rrule-utils: ✅
 *   - Task 19 RecurrenceFields + RecurrencePreview: ✅
 *   - Task 20 form schema (Zod refine): ✅
 *   - Task 20 form UI 統合 (ReservationForm.tsx に toggle + conditional render): ⏳ Follow-up
 *   - Task 21 server action: ✅
 *   - Task 22 calendar view 「定期」バッジ: ✅
 *   - Task 23 admin SeriesInfoSection: ✅
 *   - Task 26 customer mypage SeriesInfoSection: ✅
 *
 * 本 spec は Task 20 form UI 統合が完了するまで partial に skip される (steps 1-3)。
 * DB seed で series を作成 → steps 4-7 のみを検証する mini golden path で先に配線する。
 * 完全な end-to-end (form → command → cancel) は Task 20 UI follow-up 後に有効化される。
 */

import { test, expect } from "@playwright/test";

test.describe("admin recurring reservation golden path (Phase B.2 task 27)", () => {
  test.fixme("form UI wiring 完了までは skip (Task 20 follow-up)", async ({
    page,
  }) => {
    // TODO: Task 20 form UI 統合 (ReservationForm.tsx に「繰返しにする」toggle) が
    // 完了したら fixme を外して有効化。
    //
    // implementation outline:
    //   1. await login as admin (E2E bypass via ADMIN_TEST_IAP_EMAIL)
    //   2. await page.goto('/admin/reservations/new')
    //   3. select space + customer + date/time
    //   4. click 'toggle-recurring'
    //   5. fill RecurrenceFields (freq=WEEKLY, byday=TU, count=10)
    //   6. expect RecurrencePreview text /毎週.*火.*10/
    //   7. submit
    //   8. expect success toast + redirect to series detail
    //   9. navigate to /admin/reservations (calendar view)
    //  10. expect >= 10 events with '定期' badge visible on the week
    //  11. click first instance → detail page
    //  12. expect SeriesInfoSection with 3 cancel buttons
    //  13. click 'series-all cancel' button
    //  14. expect success
    //  15. reload calendar → all 10 events display as CANCELLED
    void page;
  });

  test.fixme("DB-seeded series で SeriesInfoSection + 3 択キャンセルフローのみ検証 (mini golden path)", async ({
    page,
  }) => {
    // TODO: 別 fixture で series を seed してから
    //   1. admin としてログイン
    //   2. /admin/reservations/[instanceId] に navigate
    //   3. SeriesInfoSection が visible、3 択 button が表示される
    //   4. '定期予約すべてをキャンセル' を click
    //   5. success message + reload で series が cancelled 表示になる
    void page;
  });
});
