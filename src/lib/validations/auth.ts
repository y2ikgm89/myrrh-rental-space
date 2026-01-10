import { z } from 'zod'
import { Role } from '@/generated/prisma/client/enums'

/**
 * 認証用入力スキーマ（クライアント/サーバー共通）
 */
export const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export type CredentialsInput = z.input<typeof credentialsSchema>
export type CredentialsData = z.output<typeof credentialsSchema>

/**
 * Auth.js コールバック用のユーザー識別子スキーマ
 */
export const authUserSchema = z
  .object({
    id: z.string(),
    role: z.nativeEnum(Role),
  })
  .passthrough()

/**
 * JWT へ付与するペイロードスキーマ
 */
export const authTokenSchema = z
  .object({
    id: z.string(),
    role: z.nativeEnum(Role),
  })
  .passthrough()

/**
 * ログイントークンの最小バリデーション
 */
export const loginTokenSchema = z.string().min(1)

export const loginTokenResponseSchema = z.object({
  token: z.string().min(1),
  loginUrl: z.string().min(1),
  expiresAt: z.string().min(1),
})
