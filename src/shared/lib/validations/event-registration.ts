import { z } from "zod";
import {
  prismaCuid2IdSchema,
  prismaCuidIdSchema,
} from "@/shared/lib/validations/params";

const eventRegistrationBaseSchema = z.object({
  eventId: prismaCuidIdSchema("イベント"),
  slotId: prismaCuid2IdSchema("タイムスロット"),
  ticketId: prismaCuidIdSchema("チケット"),
  name: z
    .string()
    .min(1, { error: "お名前は必須です" })
    .max(100, { error: "お名前は100文字以内です" }),
  email: z.email({ error: "有効なメールアドレスを入力してください" }),
  phone: z.string().max(20).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  // bot対策のhoneypotフィールド。フォームに実在しない項目("website")を装い、
  // botが機械的に埋めやすい名前にする(OWASP Automated Threats Handbook推奨)。
  // formRenderedAtは表示から3秒未満の送信を拒否する時間トラップ。
  // どちらもZodではエラー化せずServer Action側のcheckBotHeuristicsで判定する
  // (validationエラーとして出すとbotに手がかりを与えるため)。
  website: z.string().optional(),
  formRenderedAt: z.coerce.number().optional(),
});

export const publicEventRegistrationSchema = eventRegistrationBaseSchema.extend(
  {
    quantity: z
      .number()
      .int()
      .min(1, { error: "参加人数は1以上です" })
      .max(10, { error: "参加人数は10名以下です" })
      .default(1),
    turnstileToken: z.string().min(1, { error: "セキュリティ検証が必要です" }),
    /**
     * 同意済み規約 ID (uuid) 配列。FormData の multiple hidden input から
     * z.preprocess で normalize する。空配列は許容するが、server-side で
     * `assertAllRequiredTermsAgreed({scope: EVENT_REGISTRATION})` により
     * 必須規約への subset 一致を強制する。
     */
    agreedTermsIds: z.preprocess(
      (v) => {
        if (v === undefined || v === null) return [];
        if (Array.isArray(v)) return v;
        if (typeof v === "string") return v.length > 0 ? [v] : [];
        return v;
      },
      z.array(z.uuid({ error: "規約IDが不正です" })).default([]),
    ),
  },
);

export type PublicEventRegistrationInput = z.input<
  typeof publicEventRegistrationSchema
>;

/**
 * 公開イベント waitlist（キャンセル待ち）登録フォーム用スキーマ。
 * `publicEventRegistrationSchema` と同じ base + extend 形状（quantity 上限・
 * turnstileToken・agreedTermsIds の chain も同一）を共有する。
 */
export const publicEventWaitlistRegistrationSchema =
  eventRegistrationBaseSchema.extend({
    quantity: z
      .number()
      .int()
      .min(1, { error: "参加人数は1以上です" })
      .max(10, { error: "参加人数は10名以下です" })
      .default(1),
    turnstileToken: z.string().min(1, { error: "セキュリティ検証が必要です" }),
    /**
     * 同意済み規約 ID (uuid) 配列。publicEventRegistrationSchema と同型
     * （normalize の理由は同スキーマの JSDoc 参照）。
     */
    agreedTermsIds: z.preprocess(
      (v) => {
        if (v === undefined || v === null) return [];
        if (Array.isArray(v)) return v;
        if (typeof v === "string") return v.length > 0 ? [v] : [];
        return v;
      },
      z.array(z.uuid({ error: "規約IDが不正です" })).default([]),
    ),
  });

export type PublicEventWaitlistRegistrationInput = z.input<
  typeof publicEventWaitlistRegistrationSchema
>;

/**
 * 無料チケットの waitlist 繰り上げ当選確認 URL 用スキーマ
 * （`/events/waitlist/confirm?token=...`）。token は
 * `createWaitlistOfferToken` が発行する base64url 暗号文で、cuid 等の
 * 固定フォーマットを持たないため min(1) のみで検証する。
 */
export const publicEventWaitlistConfirmSchema = z.object({
  token: z.string().min(1, { error: "トークンが必要です" }),
  turnstileToken: z.string().min(1, { error: "セキュリティ検証が必要です" }),
});

export type PublicEventWaitlistConfirmInput = z.infer<
  typeof publicEventWaitlistConfirmSchema
>;

export const adminEventRegistrationSchema = eventRegistrationBaseSchema.extend({
  quantity: z.number().int().min(1, { error: "参加人数は1以上です" }),
});

export type AdminEventRegistrationInput = z.infer<
  typeof adminEventRegistrationSchema
>;
