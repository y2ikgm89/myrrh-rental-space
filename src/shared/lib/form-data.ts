/**
 * FormData 型安全ヘルパー
 *
 * Server Actions で FormData からフィールドを型安全に取得する。
 */

/**
 * FormDataから文字列を型安全に取得
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
 */
export function getFormBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === "true" || value === "on";
}
