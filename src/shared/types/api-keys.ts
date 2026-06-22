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
 * カスタムAPIキー（汎用）
 */
export type CustomApiKeyData = {
  id: string;
  name: string;
  keyName: string;
  description?: string | undefined;
  lastTestedAt?: Date | undefined;
  connectionStatus?: ConnectionStatus | undefined;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * カスタムAPIキーの入力形式
 */
export type CustomApiKeyInput = {
  name: string;
  keyName: string;
  keyValue: string;
  description?: string;
};

/**
 * カスタムAPIキーのDB保存形式
 */
export type CustomApiKeyStored = {
  name: string;
  keyName: string;
  keyValue: string; // encrypted
  description?: string | undefined;
  lastTestedAt?: string | undefined;
  connectionStatus?: ConnectionStatus | undefined;
  createdAt: string;
  updatedAt: string;
};

/**
 * カスタムAPIキーのマップ形式
 */
export type CustomApiKeysMap = Record<string, CustomApiKeyStored>;
