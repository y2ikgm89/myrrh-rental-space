import { z } from "zod";
import { DASHBOARD_ROLES } from "@/shared/lib/admin-roles";

// =============================================================================
// User Schemas
// =============================================================================

/**
 * ユーザー作成フォーム用スキーマ
 *
 * DASHBOARD_ROLES（SUPER_ADMIN/ADMIN/EDITOR/VIEWER）のみ許可。
 * USER / CUSTOMER は公開ユーザー用のためスタッフ管理画面から作成不可。
 * 階層チェック（actor が target を作成可能か）は Server Action 層で行う。
 */
export const createUserSchema = z.object({
  email: z.string().email({ error: "有効なメールアドレスを入力してください" }),
  password: z.string().min(8, { error: "パスワードは8文字以上必要です" }),
  name: z.string().min(1, { error: "名前は必須です" }).max(100),
  role: z.enum(DASHBOARD_ROLES),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * ユーザー更新フォーム用スキーマ
 */
export const updateUserSchema = z.object({
  email: z.string().email({ error: "有効なメールアドレスを入力してください" }),
  name: z.string().min(1, { error: "名前は必須です" }).max(100),
  role: z.enum(DASHBOARD_ROLES),
  password: z
    .string()
    .min(8, { error: "パスワードは8文字以上必要です" })
    .optional()
    .or(z.literal("")),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
