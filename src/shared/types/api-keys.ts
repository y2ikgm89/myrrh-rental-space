/**
 * API Key Management Types
 *
 * 外部サービスAPIキー管理の型定義
 *
 * @module shared/types/api-keys
 */

export type ConnectionStatus = "connected" | "error" | null;

/**
 * API接続テスト結果
 */
export type ApiKeyTestResult = {
  success: boolean;
  error?: string;
  message?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Resend設定
 */
export type ResendConfig = {
  apiKeyMasked: string | null;
  webhookSecretMasked: string | null;
  lastTestedAt: Date | null;
  connectionStatus: ConnectionStatus;
};

/**
 * Turnstile設定
 */
export type TurnstileConfig = {
  siteKey: string | null;
  secretKeyMasked: string | null;
  lastTestedAt: Date | null;
  connectionStatus: ConnectionStatus;
};

/**
 * Google Maps設定
 */
export type GoogleMapsConfig = {
  apiKeyMasked: string | null;
  lastTestedAt: Date | null;
  connectionStatus: ConnectionStatus;
};

/**
 * SwitchBot スマートロック連携設定
 */
export type SwitchBotConfig = {
  enabled: boolean;
  openTokenMasked: string | null;
  secretKeyMasked: string | null;
  passcodeBufferMinutes: number;
  lastTestedAt: Date | null;
  connectionStatus: ConnectionStatus;
};
