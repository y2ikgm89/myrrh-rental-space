/**
 * Stripe設定のバリデーションスキーマ
 */

import { z } from 'zod'
import {
  isValidPublishableKey,
  isValidSecretKey,
  isValidWebhookSecret,
  keysHaveMatchingMode,
} from '@/admin/lib/stripe'

// バリデーションメッセージ
interface ValidationMessages {
  publishableKey: string
  secretKey: string
  webhookSecret: string
  keyModeMismatch: string
  maxLength: (field: string) => string
}

const MESSAGES: ValidationMessages = {
  publishableKey: '公開可能キーは pk_test_ または pk_live_ で始まる必要があります',
  secretKey: 'シークレットキーは sk_test_ または sk_live_ で始まる必要があります',
  webhookSecret: 'Webhookシークレットは whsec_ で始まる必要があります',
  keyModeMismatch: '公開可能キーとシークレットキーのモード（test/live）が一致していません',
  maxLength: (field: string) => `${field}は200文字以内で入力してください`,
}

/**
 * Stripe設定の更新スキーマ
 */
export const stripeSettingsSchema = z
  .object({
    stripeEnabled: z.boolean(),
    stripeTestMode: z.boolean(),
    stripePublishableKey: z
      .string()
      .max(200, MESSAGES.maxLength('公開可能キー'))
      .nullable()
      .optional()
      .refine((val) => !val || isValidPublishableKey(val), {
        message: MESSAGES.publishableKey,
      }),
    stripeSecretKey: z
      .string()
      .max(200, MESSAGES.maxLength('シークレットキー'))
      .nullable()
      .optional()
      .refine((val) => !val || isValidSecretKey(val), {
        message: MESSAGES.secretKey,
      }),
    stripeWebhookSecret: z
      .string()
      .max(200, MESSAGES.maxLength('Webhookシークレット'))
      .nullable()
      .optional()
      .refine((val) => !val || isValidWebhookSecret(val), {
        message: MESSAGES.webhookSecret,
      }),
    stripeCurrency: z.enum(['jpy', 'usd', 'eur']).default('jpy'),
  })
  .refine(
    (data) => {
      if (data.stripePublishableKey && data.stripeSecretKey) {
        return keysHaveMatchingMode(data.stripePublishableKey, data.stripeSecretKey)
      }
      return true
    },
    {
      message: MESSAGES.keyModeMismatch,
      path: ['stripeSecretKey'],
    }
  )

export type StripeSettingsInput = z.infer<typeof stripeSettingsSchema>

/**
 * 接続テスト用スキーマ（シークレットキーのみ）
 */
export const stripeConnectionTestSchema = z.object({
  secretKey: z
    .string()
    .min(1, 'シークレットキーを入力してください')
    .refine(isValidSecretKey, {
      message: MESSAGES.secretKey,
    }),
})

export type StripeConnectionTestInput = z.infer<typeof stripeConnectionTestSchema>
