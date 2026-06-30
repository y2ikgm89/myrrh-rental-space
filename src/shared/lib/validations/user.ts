import { z } from "zod";
import { STAFF_ASSIGNABLE_ROLES } from "@/shared/lib/admin-roles";

// =============================================================================
// User Schemas
// =============================================================================

/**
 * ユーザー作成フォーム用スキーマ
 *
 * STAFF_ASSIGNABLE_ROLES（ADMIN/EDITOR/VIEWER）のみ許可。
 * SUPER_ADMIN は bootstrap 専用、USER / CUSTOMER は公開ユーザー用のため
 * スタッフ管理画面から作成不可。
 * 階層チェック（actor が target を作成可能か）は Server Action 層で行う。
 */
export const createUserSchema = z.object({
  email: z.email({ error: "有効なメールアドレスを入力してください" }),
  name: z.string().min(1, { error: "名前は必須です" }).max(100),
  role: z.enum(STAFF_ASSIGNABLE_ROLES),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * ユーザー更新フォーム用スキーマ
 */
export const updateUserSchema = z.object({
  email: z.email({ error: "有効なメールアドレスを入力してください" }),
  name: z.string().min(1, { error: "名前は必須です" }).max(100),
  role: z.enum(STAFF_ASSIGNABLE_ROLES),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
