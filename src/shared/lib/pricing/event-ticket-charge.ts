/**
 * イベントチケットの請求額（純粋関数）
 *
 * `EventTicket.price` は **`unitSize` 名分の値段**である。schema の
 * `unitSize` は「1申込あたりの人数単位（1 = 1名、2 = 2名セット 等）」で、
 * 管理フォームのヘルプも「例: グループ枠なら 4（4 名で 1 チケット）」、
 * 公開ページの表示も「¥18,000 / 4 名」になっている。
 *
 * したがって請求額は `price × 必要チケット枚数` であって
 * `price × 参加人数` ではない。枚数は `ceil(参加人数 / unitSize)` —
 * 4 名セットに 5 名で申し込めば 2 枚必要になる。
 *
 * 旧実装は全経路で `price × 参加人数` を請求していた（`unitSize` に対する
 * 乗除算はリポジトリ全体で 0 箇所だった）。`unitSize = 1` のチケットでは
 * `ceil(n / 1) = n` なので差は出ないが、管理画面のプリセットが提供する
 * 「グループ (4名) ¥18,000」を選ぶと 4 名申込で 72,000 円が請求されていた。
 *
 * **定員は人数で数える。ここは変えない。** `EventTicket.capacity` /
 * `EventTimeSlot.capacity` に対する消費は `EventRegistration.quantity`
 * （＝参加人数）の生の合計で、残席表示・満席判定・エラー文言・CSV・
 * 各メール雛形がすべてその基準で一致している。変えるのは金額だけ。
 *
 * 前提: `unitSize >= 1`。DB の `event_tickets_unit_size_positive` CHECK と
 * 管理フォームの `z.number().int().min(1)` の両方が強制しており、
 * 呼出側はいずれも DB から読んだ行を渡す。
 */

/** 参加人数を賄うのに必要なチケット枚数。 */
export function eventTicketUnitCount(
  quantity: number,
  unitSize: number,
): number {
  return Math.ceil(quantity / unitSize);
}

/** チケット単価 × 必要枚数。0 円チケットは 0 を返す。 */
export function eventTicketChargeAmount(
  ticket: { readonly price: number; readonly unitSize: number },
  quantity: number,
): number {
  return ticket.price * eventTicketUnitCount(quantity, ticket.unitSize);
}
