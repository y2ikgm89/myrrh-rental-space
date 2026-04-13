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
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // アクセント記号削除
    .replace(/[^a-z0-9\s-]/g, "") // 英数字・スペース・ハイフン以外削除
    .replace(/\s+/g, "-") // スペースをハイフンに
    .replace(/-+/g, "-") // 連続ハイフンを1つに
    .replace(/^-+|-+$/g, "") // 先頭・末尾のハイフン削除
    .slice(0, maxLength);

  // 空の場合はランダムIDでフォールバック
  if (!slug) {
    const randomId = crypto.randomUUID().slice(0, 8);
    return `${prefix}-${randomId}`;
  }

  return slug;
}
