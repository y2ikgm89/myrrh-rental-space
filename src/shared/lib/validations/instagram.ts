/**
 * Instagram Validation Schemas
 *
 * Instagram連携機能のバリデーションスキーマ
 *
 * @module shared/lib/validations/instagram
 */

import { z } from "zod";
import { InstagramFeedLayout } from "@/shared/db/enums";

// =============================================================================
// Settings Schema
// =============================================================================

/**
 * Instagram フィード表示設定のバリデーションスキーマ
 */
export const instagramSettingsSchema = z.object({
  feedEnabled: z.boolean(),
  feedLayout: z.enum(InstagramFeedLayout),
  feedColumns: z.number().int().min(2).max(6),
  feedMaxItems: z.number().int().min(1).max(24),
  showCaption: z.boolean(),
  showViewAll: z.boolean(),
});

export type InstagramSettingsInput = z.infer<typeof instagramSettingsSchema>;

// =============================================================================
// Post URL Schema
// =============================================================================

const INSTAGRAM_POST_URL_PATTERN =
  /^https:\/\/(www\.)?instagram\.com\/(p|reel)\/[\w-]+\/?/;

/**
 * Instagram投稿URLのバリデーションスキーマ
 */
export const instagramPostUrlSchema = z
  .string()
  .url({ error: "有効なURLを入力してください" })
  .refine((url) => INSTAGRAM_POST_URL_PATTERN.test(url), {
    error: "有効なInstagram投稿URLを入力してください",
  });

/**
 * Instagram投稿URLかどうかを検証
 */
export function isValidInstagramPostUrl(url: string): boolean {
  return INSTAGRAM_POST_URL_PATTERN.test(url);
}

// =============================================================================
// Token Schema
// =============================================================================

/**
 * Instagramトークンのバリデーションスキーマ
 */
export const instagramTokenSchema = z
  .string()
  .min(1, { error: "トークンを入力してください" });

/**
 * Instagramアクセストークンの簡易形式検証
 * トークンは通常 IGQV で始まるか、英数字の長い文字列
 */
export function isValidInstagramToken(token: string): boolean {
  // トークンは最低でも50文字以上（実際はもっと長い）
  return token.length >= 50 && /^[a-zA-Z0-9_-]+$/.test(token);
}

// =============================================================================
// Post ID Schema
// =============================================================================

/**
 * Instagram投稿IDのバリデーションスキーマ
 */
export const instagramPostIdSchema = z
  .string()
  .min(1, { error: "投稿IDを入力してください" })
  .regex(/^[a-zA-Z0-9_-]+$/, { error: "無効な投稿ID形式です" });

/**
 * Instagram投稿URLから投稿ショートコードを抽出
 */
export function extractInstagramShortcode(url: string): string | null {
  const match = url.match(/instagram\.com\/(p|reel)\/([\w-]+)/);
  return match?.[2] ?? null;
}
