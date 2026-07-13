/**
 * Stripe設定のバリデーションスキーマ
 */

import { z } from "zod";
import {
  SUPPORTED_CURRENCY_VALUES,
  isValidPublishableKey,
  isValidSecretKey,
  isValidWebhookSecret,
  keysHaveMatchingMode,
} from "@/shared/lib/stripe-shared";
import { STRIPE_PAYMENT_METHOD_TYPE_VALUES } from "@/shared/lib/stripe-payment-methods";

// バリデーションメッセージ
interface ValidationMessages {
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
  keyModeMismatch: string;
  maxLength: (field: string) => string;
}

const MESSAGES: ValidationMessages = {
  publishableKey:
    "公開可能キーは pk_test_ または pk_live_ で始まる必要があります",
  secretKey:
    "シークレットキーは sk_test_ または sk_live_ で始まる必要があります",
  webhookSecret: "Webhookシークレットは whsec_ で始まる必要があります",
  keyModeMismatch:
    "公開可能キーとシークレットキーのモード（test/live）が一致していません",
  maxLength: (field: string) => `${field}は200文字以内で入力してください`,
};

/**
 * Stripe設定の更新スキーマ
 */
export const stripeSettingsSchema = z
  .object({
    stripeEnabled: z.boolean(),
    stripePublishableKey: z
      .string()
      .max(200, { error: MESSAGES.maxLength("公開可能キー") })
      .nullable()
      .optional()
      .refine((val) => !val || isValidPublishableKey(val), {
        error: MESSAGES.publishableKey,
      }),
    stripeSecretKey: z
      .string()
      .max(200, { error: MESSAGES.maxLength("シークレットキー") })
      .nullable()
      .optional()
      .refine((val) => !val || isValidSecretKey(val), {
        error: MESSAGES.secretKey,
      }),
    stripeWebhookSecret: z
      .string()
      .max(200, { error: MESSAGES.maxLength("Webhookシークレット") })
      .nullable()
      .optional()
      .refine((val) => !val || isValidWebhookSecret(val), {
        error: MESSAGES.webhookSecret,
      }),
    stripeCurrency: z
      .enum(SUPPORTED_CURRENCY_VALUES)
      .default(SUPPORTED_CURRENCY_VALUES[0]),
    // Stripe Checkout Session `payment_method_types` に渡す method 集合。
    // Settings.stripePaymentMethodTypes が SSoT で最低 1 件必須。
    // ハードコード fallback を持たないため空配列は許容しない (DB default `["card"]`
    // で常に 1 件以上入っているため default に頼らない)。フィールド未提供時のみ
    // 便宜的に `["card"]` に補完する (input 側の boundary normalization)。
    stripePaymentMethodTypes: z
      .array(z.enum(STRIPE_PAYMENT_METHOD_TYPE_VALUES))
      .min(1, {
        error: "少なくとも 1 種類の決済方法を有効にしてください",
      })
      .transform((methods) => Array.from(new Set(methods)))
      .default(["card"]),
  })
  .refine(
    (data) => {
      if (data.stripePublishableKey && data.stripeSecretKey) {
        return keysHaveMatchingMode(
          data.stripePublishableKey,
          data.stripeSecretKey,
        );
      }
      return true;
    },
    {
      error: MESSAGES.keyModeMismatch,
      path: ["stripeSecretKey"],
    },
  );

export type StripeSettingsInput = z.infer<typeof stripeSettingsSchema>;

/**
 * 接続テスト用スキーマ（シークレットキーのみ）
 */
export const stripeConnectionTestSchema = z.object({
  secretKey: z
    .string()
    .min(1, { error: "シークレットキーを入力してください" })
    .refine(isValidSecretKey, {
      error: MESSAGES.secretKey,
    }),
});

export type StripeConnectionTestInput = z.infer<
  typeof stripeConnectionTestSchema
>;
