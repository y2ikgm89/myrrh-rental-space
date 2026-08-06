/**
 * 期間を表す列の組と、その順序を守っている CHECK 制約の名前。
 *
 * ## なぜ 2 つのテストで共有するのか
 *
 * この宣言は 2 つのことを言っている:
 *
 *   1. 「この組には順序制約がある」（実在するか = `temporal-order-constraints.test.ts`）
 *   2. 「その制約は正しい向きを持つ」（逆転行が弾かれるか = `value-domain-constraints.test.ts`）
 *
 * 2 が付いていない宣言は、述語を恒真式（`CHECK (true)`）に書き換えても
 * すべて緑のまま通る。実際、宣言 8 本に対して逆転行の probe があったのは
 * 4 本だけで、静的側の docstring は「向きは実測している」と書いていた。
 *
 * **同じ定数を両方が読む**ことで、片方に足してもう片方を忘れる形を無くす。
 * `value-domain-constraints.test.ts` の probe 表は
 * `Record<TemporalOrderPairKey, string>` なので、ここに 1 行足すと
 * probe を書くまで **tsc:test がコンパイルエラーで落ちる**。
 *
 * **順序制約を持たない選択肢を用意しない。** 期間の組で「順序はどちらでもよい」は
 * 成立しないので、免除ではなく制約名だけを書く。持てない事情ができたときは、
 * この型を広げる前にその事情を疑う。
 */
export const ORDER_CONSTRAINTS = {
  "Reservation.start_time": "reservations_time_order_check",
  "EventTimeSlot.start_at": "event_time_slots_time_order",
  "SpaceRatePlan.effective_from": "space_rate_plans_effective_range_check",
  "SpaceRatePlan.start_time": "space_rate_plans_time_of_day_order_check",
  "BlockedDate.start_date": "blocked_dates_date_order_check",
  "Coupon.valid_from": "coupons_validity_order_check",
  "AnnouncementBar.start_at": "announcement_bars_period_order_check",
  "Event.first_slot_start_at": "events_slot_span_order_check",
  "SmartLockPasscode.start_time": "smart_lock_passcodes_window_order_check",
} as const satisfies Readonly<Record<string, string>>;

/** `<Model>.<開始列の物理名>`。 */
export type TemporalOrderPairKey = keyof typeof ORDER_CONSTRAINTS;
