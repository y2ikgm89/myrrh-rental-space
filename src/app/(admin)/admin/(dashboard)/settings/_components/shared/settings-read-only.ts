/** 設定フォーム共通の read-only props。 */
export type SettingsReadOnlyProps = {
  readOnly?: boolean;
};

/** 送信中または閲覧専用のときフォームコントロールを無効化する。 */
export function isSettingsFormDisabled(
  isPending: boolean,
  readOnly = false,
): boolean {
  return isPending || readOnly;
}
