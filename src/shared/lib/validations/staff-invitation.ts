/**
 * スタッフ招待バリデーションスキーマ
 *
 * ロール階層: admin-roles.ts `INVITABLE_BY` を正とする。
 * SUPER_ADMIN は招待経由で付与不可（システム初期化時のみ作成可）。
 */

import { z } from "zod";
import { Role } from "@/shared/lib/validations/enums/prisma-types";

// =============================================================================
// Invitable roles (SUPER_ADMIN を除外)
// =============================================================================

/**
 * 招待フォーム / 招待 API が受け付けるロール。
 *
 * SUPER_ADMIN / USER / CUSTOMER を除外。Server Action 層で更に actor 階層チェックを行うが、
 * スキーマ段階で基本的な上限を切る（defense-in-depth の第一層）。
 */
const INVITABLE_ROLES = [Role.ADMIN, Role.EDITOR, Role.VIEWER] as const;

// =============================================================================
// Schemas
// =============================================================================

/**
 * 招待作成スキーマ
 *
 * 階層チェック（actor が target を招待可能か）はドメインコマンド層で行う。
 */
export const createInvitationSchema = z.object({
  email: z.email({ error: "有効なメールアドレスを入力してください" }),
  role: z.enum(INVITABLE_ROLES),
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
