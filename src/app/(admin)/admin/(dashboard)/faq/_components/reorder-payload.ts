/**
 * 並び替え後の `order` 割り当てを決める。
 *
 * ## なぜページ位置から採番しないのか
 *
 * 削除は `deletedAt` を立てるだけで採番し直さないので、削除履歴のあるカテゴリでは
 * `order` が歯抜けになる（0..24 のうち 0 を消すと生存 24 件は 1..24）。
 *
 * `startIndex + index`（ページ位置）から採番すると、2 ページ目のドラッグが
 * order 20..23 を要求し、**1 ページ目末尾の order=20 と衝突**する。
 * `reorderFaqItems` の重複チェックが `VALIDATION` を投げ、クライアントは
 * toast を出して巻き戻すので、**以後そのカテゴリの 2 ページ目以降では並び替えが
 * 一切通らない**（監査 F-32）。管理者には理由が分からず、UI から採番を詰め直す
 * 手段も無い。カテゴリ移動でも同じ歯抜けが起きる。
 *
 * ## 何をするか
 *
 * 「いま画面に出ている行が占めている `order` の値」を昇順に取り、新しい並び順へ
 * そのまま割り当て直す。**自分たちの値を入れ替えるだけ**なので、歯抜けがあっても
 * 他ページの行と衝突しない。
 */
export function buildReorderPayload<T extends { id: string; order: number }>(
  /** 並び替え**前**の可視行（現在の order を持っている）。 */
  visibleItems: readonly T[],
  /** 並び替え**後**の可視行（順序だけが変わっている）。 */
  reorderedItems: readonly T[],
): { id: string; order: number }[] {
  const occupiedOrders = visibleItems
    .map((item) => item.order)
    .sort((a, b) => a - b);

  return reorderedItems.map((item, index) => ({
    id: item.id,
    // 可視行と並び替え後の件数は常に一致する（同じ集合の並び替えなので）。
    // 万一ずれたら元の order を保つ＝何も動かさない、が安全側。
    order: occupiedOrders[index] ?? item.order,
  }));
}
