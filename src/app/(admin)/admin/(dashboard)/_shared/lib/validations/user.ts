import { z } from 'zod'
import { Role } from '@/shared/generated/prisma/enums'

// =============================================================================
// User Schemas
// =============================================================================

/**
 * ユーザー作成フォーム用スキーマ
 */
export const createUserSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  password: z.string().min(8, 'パスワードは8文字以上必要です'),
  name: z.string().min(1, '名前は必須です').max(100),
  role: z.nativeEnum(Role),
})

export type CreateUserInput = z.infer<typeof createUserSchema>

/**
 * ユーザー更新フォーム用スキーマ
 */
export const updateUserSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  name: z.string().min(1, '名前は必須です').max(100),
  role: z.nativeEnum(Role),
  password: z.string().min(8, 'パスワードは8文字以上必要です').optional().or(z.literal('')),
})

export type UpdateUserInput = z.infer<typeof updateUserSchema>

// =============================================================================
// User Data Types
// =============================================================================

/**
 * ユーザーデータ型
 */
export type UserData = {
  id: string
  email: string
  name: string
  role: Role
  emailVerified: boolean
  image: string | null
  createdAt: Date
  updatedAt: Date
  _count: {
    reservations: number
    blogPosts: number
  }
}

/**
 * ユーザー一覧取得パラメータ型
 */
export type UserListParams = {
  page?: number
  perPage?: number
  search?: string
  role?: Role | 'ALL'
  sortBy?: 'name' | 'email' | 'role' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

/**
 * ユーザー一覧取得結果型
 */
export type UserListResult = {
  users: UserData[]
  total: number
  page: number
  perPage: number
  totalPages: number
}
