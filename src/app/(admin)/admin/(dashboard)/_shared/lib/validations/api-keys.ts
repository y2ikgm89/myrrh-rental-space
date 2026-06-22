/**
 * API Keys Validation Schemas
 *
 * 外部サービスAPIキーのバリデーションスキーマ
 */

import { z } from "zod";

// =============================================================================
// Resend
// =============================================================================

export const resendSettingsSchema = z.object({
  resendApiKey: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .refine((val) => !val || val.startsWith("re_"), {
      error: "Resend APIキーは re_ で始まる必要があります",
    }),
});

export type ResendSettingsInput = z.infer<typeof resendSettingsSchema>;

/**
 * Resend APIキーの形式検証
 */
export function isValidResendApiKey(key: string): boolean {
  return key.startsWith("re_") && key.length > 10;
}

// =============================================================================
// Cloudflare Turnstile
// =============================================================================

export const turnstileSettingsSchema = z.object({
  turnstileSiteKey: z.string().max(100).nullable().optional(),
  turnstileSecretKey: z.string().max(200).nullable().optional(),
});

export type TurnstileSettingsInput = z.infer<typeof turnstileSettingsSchema>;

/**
 * Turnstileキーの形式検証
 * Turnstileキーは0xで始まる16進数形式
 */
export function isValidTurnstileKey(key: string): boolean {
  return key.startsWith("0x") && key.length >= 10;
}

// =============================================================================
// Google Maps
// =============================================================================

export const googleMapsSettingsSchema = z.object({
  googleMapsApiKey: z
    .string()
    .max(200)
    .nullable()
    .optional()
    .refine((val) => !val || val.startsWith("AIza"), {
      error: "Google Maps APIキーは AIza で始まる必要があります",
    }),
});

export type GoogleMapsSettingsInput = z.infer<typeof googleMapsSettingsSchema>;

/**
 * Google Maps APIキーの形式検証
 */
export function isValidGoogleMapsApiKey(key: string): boolean {
  return key.startsWith("AIza") && key.length >= 30;
}

// =============================================================================
// Custom API Keys
// =============================================================================

export const customApiKeySchema = z.object({
  name: z.string().min(1, { error: "サービス名を入力してください" }).max(100),
  keyName: z.string().min(1, { error: "キー名を入力してください" }).max(100),
  keyValue: z.string().min(1, { error: "キー値を入力してください" }).max(500),
  description: z.string().max(500).optional(),
});

export type CustomApiKeyInput = z.infer<typeof customApiKeySchema>;
