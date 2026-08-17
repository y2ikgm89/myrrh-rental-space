/**
 * 接続テストボタンは保存済み資格情報があるときだけ出す。
 * フォーム入力の有無では判定しない（Save → Test の 2 ステップ）。
 */

export function canTestResendConnection(
  apiKeyMasked: string | null | undefined,
): boolean {
  return Boolean(apiKeyMasked);
}

export function canTestTurnstileConnection(
  siteKey: string | null | undefined,
  secretKeyMasked: string | null | undefined,
): boolean {
  return Boolean(siteKey && secretKeyMasked);
}

export function canTestGoogleMapsConnection(
  apiKeyMasked: string | null | undefined,
): boolean {
  return Boolean(apiKeyMasked);
}

export function canTestSwitchBotConnection(
  openTokenMasked: string | null | undefined,
  secretKeyMasked: string | null | undefined,
): boolean {
  return Boolean(openTokenMasked && secretKeyMasked);
}

export function canTestGoogleCalendarConnection(
  serviceAccountConfigured: boolean,
  calendarId: string | null | undefined,
): boolean {
  return Boolean(serviceAccountConfigured && calendarId);
}
