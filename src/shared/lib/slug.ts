/**
 * スラッグ生成ユーティリティ
 *
 * 文字列からURLスラッグを生成する。
 * - ASCII文字は小文字に変換してハイフン区切り
 * - 日本語などの非ASCII文字のみの場合はプレフィックス + ランダムIDでフォールバック
 */
export function generateSlug(
  text: string,
  prefix = "item",
  maxLength = 50,
): string {
  const slug = sluggifyText(text, maxLength);

  // 空の場合はランダムIDでフォールバック
  if (!slug) {
    const randomId = crypto.randomUUID().slice(0, 8);
    return `${prefix}-${randomId}`;
  }

  return slug;
}

/**
 * 既存スラッグを避けつつ deterministic にユニーク化する。
 *
 * 目次・アンカー ID 生成で重複見出しに `-1`, `-2` を付番する用途。
 * `generateSlug` と異なりランダム値を使わない（Node Transform の
 * stable 性のため）。
 *
 * @param text 変換対象テキスト
 * @param used 既使用スラッグの Set（呼び出し側で shared state として保持）
 * @param fallbackPrefix 日本語等で slug が空になった場合のプレフィックス
 * @param maxLength ベーススラッグの最大長
 * @returns ユニークな slug 文字列（`used` には追加されない、呼び出し側で add する）
 */
export function generateUniqueSlug(
  text: string,
  used: ReadonlySet<string>,
  fallbackPrefix = "section",
  maxLength = 50,
): string {
  const base =
    sluggifyText(text, maxLength) || `${fallbackPrefix}-${used.size + 1}`;

  if (!used.has(base)) return base;

  let n = 1;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * 共通の slug 変換ロジック（非 ASCII 除去、ハイフン正規化）。
 * 空文字列を返しうる（呼び出し側がフォールバック責務を持つ）。
 */
function sluggifyText(text: string, maxLength: number): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // アクセント記号削除
    .replace(/[^a-z0-9\s-]/g, "") // 英数字・スペース・ハイフン以外削除
    .replace(/\s+/g, "-") // スペースをハイフンに
    .replace(/-+/g, "-") // 連続ハイフンを1つに
    .replace(/^-+|-+$/g, "") // 先頭・末尾のハイフン削除
    .slice(0, maxLength);
}
