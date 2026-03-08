import { z } from 'zod'

const signedLoginTokenPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

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
 * 署名付きログイントークンの形式バリデーション
 */
export const loginTokenSchema = z
  .string()
  .regex(signedLoginTokenPattern, { error: '有効なログイントークン形式ではありません' })

export const loginTokenResponseSchema = z.object({
  token: loginTokenSchema,
  loginUrl: z.string().min(1),
  expiresAt: z.string().min(1),
})
