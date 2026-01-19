/**
 * スタッフ招待バリデーションスキーマ
 */

import { z } from 'zod'
import { Role } from '@/shared/generated/prisma/enums'

// =============================================================================
// Schemas
// =============================================================================

/**
 * 招待作成スキーマ
 */
export const createInvitationSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  role: z.nativeEnum(Role).default(Role.USER),
  name: z.string().max(100).optional(),
})

/**
 * パスワード設定スキーマ
 */
export const setupPasswordSchema = z.object({
  token: z.string().min(1, 'トークンが必要です'),
  password: z.string().min(8, 'パスワードは8文字以上必要です'),
  confirmPassword: z.string().min(8, '確認用パスワードを入力してください'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'パスワードが一致しません',
  path: ['confirmPassword'],
})

// =============================================================================
// Types
// =============================================================================

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>
export type SetupPasswordInput = z.infer<typeof setupPasswordSchema>

/**
 * 招待データ型
 */
export type InvitationData = {
  id: string
  email: string
  role: Role
  name: string | null
  expiresAt: Date
  usedAt: Date | null
  createdAt: Date
}

// =============================================================================
// Constants
// =============================================================================

/**
 * 招待トークンの有効期限（7日）
 */
export const INVITATION_EXPIRY_DAYS = 7
