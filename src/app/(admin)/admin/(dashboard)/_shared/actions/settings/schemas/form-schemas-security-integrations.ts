/**
 * 設定セクション用フォームスキーマ — セキュリティ・連携（Stripe / Calendar / Instagram 等）
 *
 * 任意テキストは {@link optionalText}、Switch 由来 boolean は {@link switchBoolean} を使い、
 * conform の空→undefined 変換に整合させる（空欄保存 / OFF 保存を許容する）。
 */
import { z } from "zod";
import {
  CalendarSyncMethod,
  DiscountCombinationMode,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  SUPPORTED_CURRENCY_VALUES,
  isValidPublishableKey,
  isValidSecretKey,
  isValidWebhookSecret,
  keysHaveMatchingMode,
} from "@/shared/lib/stripe-shared";
import { STRIPE_PAYMENT_METHOD_TYPE_VALUES } from "@/shared/lib/stripe-payment-methods";
import { optionalText, switchBoolean } from "./form-schema-helpers";

// =============================================================================
// Site > Security > Turnstile
// =============================================================================

export const turnstileFormSchema = z.object({
  turnstileSiteKey: optionalText(500),
  turnstileSecretKey: optionalText(500),
});

export type TurnstileFormInput = z.infer<typeof turnstileFormSchema>;

// =============================================================================
// Site > Security > Google Maps
// =============================================================================

export const googleMapsFormSchema = z.object({
  googleMapsApiKey: optionalText(500),
});

export type GoogleMapsFormInput = z.infer<typeof googleMapsFormSchema>;

// =============================================================================
// Booking > 割引設定
// =============================================================================

export const discountFormSchema = z.object({
  durationDiscountEnabled: switchBoolean(),
  // hours は割引マップのキーとして機能するため、重複を禁止する
  durationDiscountRules: z
    .array(
      z.object({
        hours: z.number().int().min(1).max(24),
        discountRate: z.number().min(1).max(100),
      }),
    )
    .refine(
      (rules) => new Set(rules.map((r) => r.hours)).size === rules.length,
      { error: "同じ時間数の割引ルールを複数登録することはできません" },
    ),
  discountCombinationMode: z.enum(DiscountCombinationMode),
  showOriginalPrice: switchBoolean(),
});

export type DiscountFormInput = z.infer<typeof discountFormSchema>;

// =============================================================================
// Integrations > Stripe
// =============================================================================

export const stripeFormSchema = z
  .object({
    stripeEnabled: switchBoolean(),
    stripePublishableKey: z
      .string()
      .max(200, { error: "公開可能キーは200文字以内で入力してください" })
      .refine((val) => !val || isValidPublishableKey(val), {
        error: "公開可能キーは pk_test_ または pk_live_ で始まる必要があります",
      })
      .optional(),
    stripeSecretKey: z
      .string()
      .max(200, { error: "シークレットキーは200文字以内で入力してください" })
      .refine((val) => !val || isValidSecretKey(val), {
        error:
          "シークレットキーは sk_test_ または sk_live_ で始まる必要があります",
      })
      .optional(),
    stripeWebhookSecret: z
      .string()
      .max(200, {
        error: "Webhookシークレットは200文字以内で入力してください",
      })
      .refine((val) => !val || isValidWebhookSecret(val), {
        error: "Webhookシークレットは whsec_ で始まる必要があります",
      })
      .optional(),
    stripeCurrency: z.enum(SUPPORTED_CURRENCY_VALUES),
    // Stripe `payment_method_types`。conform の FormData から複数値を受けるため
    // z.array を使う。SSoT の値集合は `STRIPE_PAYMENT_METHOD_TYPE_VALUES` に集約。
    // 最低 1 件必須 — ハードコード fallback を持たない (`createCheckoutSessionCommand`
    // が空配列を VALIDATION エラー化する契約と対称)。フィールド未提供時のみ
    // 便宜的に `["card"]` に補完する (input 側の boundary normalization、DB default 一致)。
    stripePaymentMethodTypes: z
      .array(z.enum(STRIPE_PAYMENT_METHOD_TYPE_VALUES))
      .min(1, { error: "少なくとも 1 種類の決済方法を有効にしてください" })
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
      error:
        "公開可能キーとシークレットキーのモード（test/live）が一致していません",
      path: ["stripeSecretKey"],
    },
  );

export type StripeFormInput = z.infer<typeof stripeFormSchema>;

// =============================================================================
// Integrations > Resend
// =============================================================================

export const resendFormSchema = z.object({
  resendApiKey: z.string().optional(),
});

export type ResendFormInput = z.infer<typeof resendFormSchema>;

// =============================================================================
// Integrations > Google Calendar
// =============================================================================

export const googleCalendarFormSchema = z.object({
  googleCalendarEnabled: switchBoolean(),
  googleCalendarId: z.string().optional(),
  serviceAccountJson: z.string().optional(),
  icalAttachmentEnabled: switchBoolean(),
  addToCalendarLinksEnabled: switchBoolean(),
  googleCalendarMeetEnabled: switchBoolean(),
  /**
   * フォーム上では null=既定 / 0=無効 / N=N分前
   * `<input type="number">` の空欄は conform で undefined になるため `.nullish()`
   * （null/undefined どちらも許容）。送信時に `?? null` で正規化する。
   */
  googleCalendarReminderMinutes: z.number().int().min(0).max(40320).nullish(),
});

export type GoogleCalendarFormInput = z.infer<typeof googleCalendarFormSchema>;

// =============================================================================
// Integrations > 双方向同期
// =============================================================================

export const twoWaySyncFormSchema = z.object({
  enabled: switchBoolean(),
  syncMethod: z.enum(CalendarSyncMethod),
});

export type TwoWaySyncFormInput = z.infer<typeof twoWaySyncFormSchema>;

// =============================================================================
// Integrations > SwitchBot
// =============================================================================

export const switchbotFormSchema = z.object({
  switchbotEnabled: switchBoolean(),
  switchbotOpenToken: optionalText(500),
  switchbotSecretKey: optionalText(500),
  switchbotPasscodeBufferMinutes: z.coerce.number().int().min(0).max(180),
});

export type SwitchBotFormInput = z.infer<typeof switchbotFormSchema>;
