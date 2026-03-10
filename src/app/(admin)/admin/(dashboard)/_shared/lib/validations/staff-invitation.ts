/**
 * スタッフ招待バリデーションスキーマ
 */

import { z } from "zod";
import { Role } from "@/shared/db/enums";

// =============================================================================
// Schemas
// =============================================================================

/**
 * 招待作成スキーマ
 */
export const createInvitationSchema = z.object({
  email: z.string().email({ error: "有効なメールアドレスを入力してください" }),
  role: z.enum(Role).default(Role.USER),
  name: z.string().max(100).optional(),
});

/**
 * パスワード設定スキーマ
 */
export const setupPasswordSchema = z
  .object({
    token: z.string().min(1, { error: "トークンが必要です" }),
    password: z.string().min(8, { error: "パスワードは8文字以上必要です" }),
    confirmPassword: z
      .string()
      .min(8, { error: "確認用パスワードを入力してください" }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    error: "パスワードが一致しません",
    path: ["confirmPassword"],
  });

// =============================================================================
// Types
// =============================================================================

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type SetupPasswordInput = z.infer<typeof setupPasswordSchema>;

// =============================================================================
// Constants
// =============================================================================

/**
 * 招待トークンの有効期限（7日）
 */
export const INVITATION_EXPIRY_DAYS = 7;
