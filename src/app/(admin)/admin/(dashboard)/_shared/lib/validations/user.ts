import { z } from "zod";
import { Role } from "@/shared/db/enums";

// =============================================================================
// User Schemas
// =============================================================================

/**
 * ユーザー作成フォーム用スキーマ
 */
export const createUserSchema = z.object({
  email: z.string().email({ error: "有効なメールアドレスを入力してください" }),
  password: z.string().min(8, { error: "パスワードは8文字以上必要です" }),
  name: z.string().min(1, { error: "名前は必須です" }).max(100),
  role: z.enum(Role),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * ユーザー更新フォーム用スキーマ
 */
export const updateUserSchema = z.object({
  email: z.string().email({ error: "有効なメールアドレスを入力してください" }),
  name: z.string().min(1, { error: "名前は必須です" }).max(100),
  role: z.enum(Role),
  password: z
    .string()
    .min(8, { error: "パスワードは8文字以上必要です" })
    .optional()
    .or(z.literal("")),
});

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
