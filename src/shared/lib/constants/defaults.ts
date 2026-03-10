/**
 * サイトデフォルト値
 *
 * DB Settings からの取得失敗時や初期状態のフォールバック
 */

export const SITE_DEFAULTS = {
  /** サイト名（DB未設定時のフォールバック） */
  name: "Myrrh Rental Space",

  /** サイト説明（DB未設定時のフォールバック） */
  description: "レンタルスペースの予約・管理サービス",
} as const;
