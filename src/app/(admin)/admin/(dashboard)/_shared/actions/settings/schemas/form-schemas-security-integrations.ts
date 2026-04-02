/**
 * 設定セクション用フォームスキーマ — セキュリティ・連携（Stripe / Calendar / Instagram 等）
 */
import { z } from "zod";
import {
  CalendarSyncMethod,
  DiscountCombinationMode,
  InstagramFeedLayout,
} from "@generated/prisma/enums";
import { SUPPORTED_CURRENCY_VALUES } from "@/admin/lib/stripe-shared";

// =============================================================================
// Site > Security > Turnstile
// =============================================================================

export const turnstileFormSchema = z.object({
  turnstileSiteKey: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
  turnstileSecretKey: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
});

export type TurnstileFormInput = z.infer<typeof turnstileFormSchema>;

// =============================================================================
// Site > Security > Google Maps
// =============================================================================

export const googleMapsFormSchema = z.object({
  googleMapsApiKey: z
    .string()
    .max(500, { error: "500文字以内で入力してください" }),
});

export type GoogleMapsFormInput = z.infer<typeof googleMapsFormSchema>;

// =============================================================================
// Site > Integrations > iCal フィード
// =============================================================================

export const icalFeedFormSchema = z.object({
  icalFeedEnabled: z.boolean(),
  icalFeedIncludeCustomerInfo: z.boolean(),
});

export type ICalFeedFormInput = z.infer<typeof icalFeedFormSchema>;

// =============================================================================
// Booking > 割引設定
// =============================================================================

export const discountFormSchema = z.object({
  durationDiscountEnabled: z.boolean(),
  durationDiscountRules: z.array(
    z.object({
      hours: z.number().int().min(1).max(24),
      discountRate: z.number().min(1).max(100),
    }),
  ),
  discountCombinationMode: z.enum(DiscountCombinationMode),
  showOriginalPrice: z.boolean(),
  discountWarningEnabled: z.boolean(),
});

export type DiscountFormInput = z.infer<typeof discountFormSchema>;

// =============================================================================
// Integrations > Stripe
// =============================================================================

export const stripeFormSchema = z.object({
  stripeEnabled: z.boolean(),
  stripeTestMode: z.boolean(),
  stripePublishableKey: z.string(),
  stripeSecretKey: z.string(),
  stripeWebhookSecret: z.string(),
  stripeCurrency: z.enum(SUPPORTED_CURRENCY_VALUES),
});

export type StripeFormInput = z.infer<typeof stripeFormSchema>;

// =============================================================================
// Integrations > Resend
// =============================================================================

export const resendFormSchema = z.object({
  resendApiKey: z.string(),
});

export type ResendFormInput = z.infer<typeof resendFormSchema>;

// =============================================================================
// Integrations > Cloudflare
// =============================================================================

export const cloudflareFormSchema = z.object({
  cloudflareZoneId: z.string(),
  cloudflareApiToken: z.string(),
});

export type CloudflareFormInput = z.infer<typeof cloudflareFormSchema>;

// =============================================================================
// Integrations > Google Calendar
// =============================================================================

export const googleCalendarFormSchema = z.object({
  googleCalendarEnabled: z.boolean(),
  googleCalendarId: z.string(),
  serviceAccountJson: z.string(),
  icalAttachmentEnabled: z.boolean(),
  addToCalendarLinksEnabled: z.boolean(),
});

export type GoogleCalendarFormInput = z.infer<typeof googleCalendarFormSchema>;

// =============================================================================
// Integrations > 双方向同期
// =============================================================================

export const twoWaySyncFormSchema = z.object({
  enabled: z.boolean(),
  syncMethod: z.enum(CalendarSyncMethod),
  pollingIntervalMin: z.number().int().min(1).max(60),
});

export type TwoWaySyncFormInput = z.infer<typeof twoWaySyncFormSchema>;

// =============================================================================
// Integrations > Instagram フィード設定
// =============================================================================

export const instagramFeedFormSchema = z.object({
  feedEnabled: z.boolean(),
  feedLayout: z.enum(InstagramFeedLayout),
  feedColumns: z.number().int().min(2).max(6),
  feedMaxItems: z.number().int().min(1).max(24),
  showCaption: z.boolean(),
  showViewAll: z.boolean(),
});

export type InstagramFeedFormInput = z.infer<typeof instagramFeedFormSchema>;
