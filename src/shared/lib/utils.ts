// =============================================================================
// FormData ヘルパー
// =============================================================================

/**
 * FormDataから文字列を型安全に取得
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @param defaultValue - デフォルト値（省略時は空文字列）
 * @returns 文字列値
 *
 * @example
 * const email = getFormString(formData, 'email')
 * const name = getFormString(formData, 'name', 'Guest')
 */
export function getFormString(
  formData: FormData,
  key: string,
  defaultValue = "",
): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : defaultValue;
}

/**
 * FormDataから文字列を取得（null許容）
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @returns 文字列値またはnull
 *
 * @example
 * const guestName = getFormStringOrNull(formData, 'guestName')
 */
export function getFormStringOrNull(
  formData: FormData,
  key: string,
): string | null {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * FormDataから数値を取得
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @param defaultValue - デフォルト値
 * @returns 数値（パース失敗時はデフォルト値）
 *
 * @example
 * const page = getFormNumber(formData, 'page', 1)
 */
export function getFormNumber(
  formData: FormData,
  key: string,
  defaultValue: number,
): number {
  const value = formData.get(key);
  if (typeof value !== "string") return defaultValue;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * FormDataから真偽値を取得
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @returns 真偽値（'true'/'on' → true、それ以外 → false）
 *
 * @example
 * const isPublished = getFormBoolean(formData, 'isPublished')
 */
export function getFormBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "true" || value === "on";
}

// =============================================================================
// スラッグ生成
// =============================================================================

/**
 * 文字列からURLスラッグを生成
 *
 * - ASCII文字は小文字に変換してハイフン区切り
 * - 日本語などの非ASCII文字のみの場合はプレフィックス + ランダムIDでフォールバック
 *
 * @param text - 元の文字列
 * @param prefix - フォールバック時のプレフィックス（デフォルト: 'item'）
 * @param maxLength - 最大文字数（デフォルト: 50）
 * @returns URLセーフなスラッグ
 *
 * @example
 * generateSlug('Hello World')      // → 'hello-world'
 * generateSlug('日本語タグ', 'tag') // → 'tag-a1b2c3d4'
 * generateSlug('Mix 混合', 'tag')   // → 'mix'
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
