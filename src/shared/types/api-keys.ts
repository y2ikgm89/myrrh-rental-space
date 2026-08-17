/**
 * API Key Management Types
 *
 * 外部サービスAPIキー管理の型定義
 *
 * @module shared/types/api-keys
 */

import type { ConnectionStatus as PrismaConnectionStatus } from "@/shared/lib/validations/enums/prisma-types";

/**
 * 外部サービスとの接続状態。**値域の SSoT は DB の `connection_status` 型**で、
 * ここはその re-export（未接続を表す null を足しただけ）。
 *
 * 以前は `"connected" | "error" | null` を手で書いていた。DB 側は 6 本の手書き
 * CHECK で同じ値域を強制していて、**片方だけ値を足しても気づけない**状態だった。
 */
export type ConnectionStatus = PrismaConnectionStatus | null;

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
  envFallbackActive: boolean;
};

/**
 * Turnstile設定
 */
export type TurnstileConfig = {
  siteKey: string | null;
  secretKeyMasked: string | null;
  lastTestedAt: Date | null;
  connectionStatus: ConnectionStatus;
  envFallbackActive: boolean;
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
