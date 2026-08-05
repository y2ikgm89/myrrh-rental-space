/**
 * 既存の値に接尾辞を足しても列の上限を超えないようにする。
 *
 * ## なぜ要るのか
 *
 * 「元の値 + 決まった接尾辞」で新しい値を作る箇所は、**元の値が上限いっぱいだと
 * 必ず溢れる**。溢れた先は PostgreSQL の 22001 で、`DomainError` ではないので
 * `executeAdminMutationResult` の変換にも乗らず 500 になる。操作者には理由が出ない。
 *
 * 実際に踏んだ形:
 *
 * - `receipts.recipient_name` VarChar(100) に「姓(50) + 空白 + 名(50)」= 101 文字
 * - `inquiries.name` VarChar(100) に同じ形（101 文字）
 * - `events.title` VarChar(200) に `${title}（コピー）` = 205 文字
 * - `events.slug` VarChar(100) に `${slug}-copy` = 105 文字（さらに `-2` が付く）
 *
 * ## 切るのは元の値のほう
 *
 * 接尾辞は「コピーである」という情報そのものなので落とさない。元の値を詰めれば
 * 操作は成功し、複製は下書きなので操作者が後から直せる。**落とすより詰める。**
 */

/**
 * `base + suffix` が `limit` 文字に収まるよう、必要なら `base` の末尾を詰める。
 *
 * @param base 元の値
 * @param suffix 必ず残す接尾辞
 * @param limit 収めたい全体の長さ（列の上限）
 * @throws suffix だけで limit を超えるとき。呼び出し側の定数がずれている証拠なので
 *         黙って空文字を返さない
 */
export function appendWithinLimit(
  base: string,
  suffix: string,
  limit: number,
): string {
  if (suffix.length > limit) {
    throw new Error(
      `接尾辞 "${suffix}"（${suffix.length} 文字）が上限 ${limit} を超えている`,
    );
  }
  const room = limit - suffix.length;
  return base.length <= room
    ? `${base}${suffix}`
    : `${base.slice(0, room)}${suffix}`;
}

/**
 * slug を `limit` 文字へ詰める。末尾がハイフンになったら落とす
 * （`foo-` に `-2` を足すと `foo--2` になり、slug の regex とも噛み合わない）。
 */
export function truncateSlug(value: string, limit: number): string {
  return value.length <= limit
    ? value
    : value.slice(0, limit).replace(/-+$/u, "");
}

/**
 * slug 版の append。詰めた結果が `-` で終わる形を作らない。
 *
 * `ensureUniqueSlug` が後から `-2` / `-3` を足すぶんの余地は、呼び出し側が
 * `limit` に織り込む。
 */
export function appendSlugWithinLimit(
  base: string,
  suffix: string,
  limit: number,
): string {
  if (suffix.length > limit) {
    throw new Error(
      `接尾辞 "${suffix}"（${suffix.length} 文字）が上限 ${limit} を超えている`,
    );
  }
  return `${truncateSlug(base, limit - suffix.length)}${suffix}`;
}
