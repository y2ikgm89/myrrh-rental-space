/**
 * FormData 型安全ヘルパー関数
 *
 * FormData.get() の戻り値（string | File | null）を型安全に処理するユーティリティ
 */

// =============================================================================
// 型定義
// =============================================================================

/**
 * フォームフィールドの値として取りうる型
 */
export type FormFieldValue = string | number | boolean | File | undefined

// =============================================================================
// 文字列フィールド
// =============================================================================

/**
 * FormDataから文字列を取得
 *
 * null、File、空文字列の場合は undefined を返す
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @returns 文字列値、または undefined
 *
 * @example
 * const name = getFormString(formData, 'name')
 * if (name !== undefined) {
 *   // name is string
 * }
 */
export function getFormString(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  if (typeof value !== 'string' || value === '') {
    return undefined
  }
  return value
}

/**
 * FormDataから文字列を取得（デフォルト値付き）
 *
 * null、File、空文字列の場合はデフォルト値を返す
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @param defaultValue - デフォルト値
 * @returns 文字列値、またはデフォルト値
 *
 * @example
 * const name = getFormStringOrDefault(formData, 'name', 'Guest')
 */
export function getFormStringOrDefault(
  formData: FormData,
  key: string,
  defaultValue: string
): string {
  const value = getFormString(formData, key)
  return value ?? defaultValue
}

/**
 * FormDataから必須文字列を取得
 *
 * フィールドがない、またはFileの場合はエラーをスローする
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @returns 文字列値
 * @throws Error フィールドが存在しないか、File型の場合
 *
 * @example
 * try {
 *   const email = getFormStringRequired(formData, 'email')
 * } catch (error) {
 *   // handle missing field
 * }
 */
export function getFormStringRequired(formData: FormData, key: string): string {
  const value = formData.get(key)
  if (typeof value !== 'string') {
    throw new Error(`Required form field '${key}' is missing or invalid`)
  }
  if (value === '') {
    throw new Error(`Required form field '${key}' is empty`)
  }
  return value
}

// =============================================================================
// 数値フィールド
// =============================================================================

/**
 * FormDataから数値を取得
 *
 * 数値に変換できない場合は undefined を返す
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @returns 数値、または undefined
 *
 * @example
 * const count = getFormNumber(formData, 'count')
 * if (count !== undefined) {
 *   // count is number
 * }
 */
export function getFormNumber(formData: FormData, key: string): number | undefined {
  const value = formData.get(key)
  if (typeof value !== 'string' || value === '') {
    return undefined
  }
  const parsed = Number(value)
  if (Number.isNaN(parsed)) {
    return undefined
  }
  return parsed
}

/**
 * FormDataから数値を取得（デフォルト値付き）
 *
 * 数値に変換できない場合はデフォルト値を返す
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @param defaultValue - デフォルト値
 * @returns 数値、またはデフォルト値
 *
 * @example
 * const page = getFormNumberOrDefault(formData, 'page', 1)
 */
export function getFormNumberOrDefault(
  formData: FormData,
  key: string,
  defaultValue: number
): number {
  const value = getFormNumber(formData, key)
  return value ?? defaultValue
}

// =============================================================================
// ブール値フィールド
// =============================================================================

/**
 * FormDataからブール値を取得
 *
 * チェックボックス用。'true'、'on'、'1' の場合に true を返す
 * チェックされていない場合は FormData に含まれないため false を返す
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @returns ブール値
 *
 * @example
 * const isAccepted = getFormBoolean(formData, 'termsAccepted')
 */
export function getFormBoolean(formData: FormData, key: string): boolean {
  const value = formData.get(key)
  return value === 'true' || value === 'on' || value === '1'
}

// =============================================================================
// ファイルフィールド
// =============================================================================

/**
 * FormDataからファイルを取得
 *
 * 値がFileでない場合、または空のファイル（size === 0）の場合は undefined を返す
 *
 * @param formData - FormDataオブジェクト
 * @param key - フィールド名
 * @returns Fileオブジェクト、または undefined
 *
 * @example
 * const file = getFormFile(formData, 'avatar')
 * if (file !== undefined) {
 *   // file is File
 *   console.log(file.name, file.size)
 * }
 */
export function getFormFile(formData: FormData, key: string): File | undefined {
  const value = formData.get(key)
  // File は Blob のサブクラス
  if (!(value instanceof File)) {
    return undefined
  }
  // input[type="file"] で未選択の場合、size === 0 の空ファイルが送信される
  if (value.size === 0) {
    return undefined
  }
  return value
}
