/**
 * カレンダー同期ループ防止
 *
 * Outbound 同期（outbound.ts / event-outbound.ts）が GCal に書き込むイベントは
 * description 先頭に識別マーカーを含む。
 * Inbound 同期（inbound.ts / event-inbound.ts）がこれらのマーカーを検出した
 * イベントをスキップすることで、アプリ側 DB に自アプリ由来イベントが
 * 再取り込みされるループを防ぐ。
 *
 * マーカー文字列は outbound / inbound 両方から参照される SSoT。
 * 変更する場合は両方の実装とテストを同時に更新すること。
 *
 * @module shared/lib/calendar-sync/loop-prevention
 */

/**
 * Reservation outbound sync が description 先頭に挿入するマーカー。
 * @see src/shared/lib/calendar-sync/outbound.ts formatCalendarEvent
 */
export const OUTBOUND_RESERVATION_MARKER = "予約ID:";

/**
 * Event outbound sync が description 先頭に挿入するマーカー。
 * @see src/shared/lib/calendar-sync/event-outbound.ts formatEventCalendarEvent
 */
export const OUTBOUND_EVENT_MARKER = "イベントID:";

/**
 * GCal イベントがアプリの outbound sync によって作成されたかを判定する。
 *
 * inbound sync の対象外として除外する（ループ防止）。
 */
export function isAppGeneratedCalendarEvent(
  description: string | null | undefined,
): boolean {
  if (!description) return false;
  return (
    description.includes(OUTBOUND_RESERVATION_MARKER) ||
    description.includes(OUTBOUND_EVENT_MARKER)
  );
}
