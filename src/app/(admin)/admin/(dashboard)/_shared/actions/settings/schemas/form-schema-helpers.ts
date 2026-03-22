/**
 * 設定フォーム共通ヘルパー（Server Action 送信前の空文字列正規化）
 */

/** 空文字列 → null 変換（Server Action 送信前に使用） */
export function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
