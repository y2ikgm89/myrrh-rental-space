import { z } from "zod";
import { entityIdSchema } from "@/shared/lib/validations/entity-id";
import { isUnknownArray } from "@/shared/lib/serialize";
import { emailFieldSchema } from "./customer-shared-fields";

const eventRegistrationBaseSchema = z.object({
  eventId: entityIdSchema("Event"),
  slotId: entityIdSchema("EventTimeSlot"),
  ticketId: entityIdSchema("EventTicket"),
  name: z
    .string({ error: "お名前は必須です" })
    .trim()
    .min(1, { error: "お名前は必須です" })
    .max(100, { error: "お名前は100文字以内です" }),
  email: emailFieldSchema,
  phone: z.string().trim().max(20).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  // bot対策のhoneypotフィールド。フォームに実在しない項目("website")を装い、
  // botが機械的に埋めやすい名前にする(OWASP Automated Threats Handbook推奨)。
  // formRenderTokenは表示から 3 秒未満の送信を弾く時間トラップ。サーバーが発行した purpose 付きトークンで、クライアントの時計は一切見ない（監査 F-71）。
  // どちらもZodではエラー化せずServer Action側のcheckBotHeuristicsで判定する
  // (validationエラーとして出すとbotに手がかりを与えるため)。
  website: z.string().optional(),
  formRenderToken: z.string().optional(),
});

export const publicEventRegistrationSchema = eventRegistrationBaseSchema.extend(
  {
    quantity: z
      .number()
      .int()
      .min(1, { error: "参加人数は1以上です" })
      .max(10, { error: "参加人数は10名以下です" })
      .default(1),
    // eslint-disable-next-line local/require-trimmed-text -- Turnstile が発行する値
    turnstileToken: z
      .string({ error: "セキュリティ検証が必要です" })
      .min(1, { error: "セキュリティ検証が必要です" }),
    /**
     * 同意済み規約 ID (uuid) 配列。FormData の multiple hidden input から
     * z.preprocess で normalize する。空配列は許容するが、server-side で
     * `assertAllRequiredTermsAgreed({scope: EVENT_REGISTRATION})` により
     * 必須規約への subset 一致を強制する。
     */
    agreedTermsIds: z.preprocess(
      (v) => {
        if (v === undefined || v === null) return [];
        if (isUnknownArray(v)) return v;
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
    // eslint-disable-next-line local/require-trimmed-text -- 同上
    turnstileToken: z
      .string({ error: "セキュリティ検証が必要です" })
      .min(1, { error: "セキュリティ検証が必要です" }),
    /**
     * 同意済み規約 ID (uuid) 配列。publicEventRegistrationSchema と同型
     * （normalize の理由は同スキーマの JSDoc 参照）。
     */
    agreedTermsIds: z.preprocess(
      (v) => {
        if (v === undefined || v === null) return [];
        if (isUnknownArray(v)) return v;
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
 * `createWaitlistOfferToken` が発行する base64url 暗号文で、uuid 等の
 * 固定フォーマットを持たないため min(1) のみで検証する。
 */
export const publicEventWaitlistConfirmSchema = z.object({
  // eslint-disable-next-line local/require-trimmed-text -- URL から渡る単発トークン
  token: z.string().min(1, { error: "トークンが必要です" }),
  // eslint-disable-next-line local/require-trimmed-text -- Turnstile が発行する値
  turnstileToken: z
    .string({ error: "セキュリティ検証が必要です" })
    .min(1, { error: "セキュリティ検証が必要です" }),
});

export type PublicEventWaitlistConfirmInput = z.infer<
  typeof publicEventWaitlistConfirmSchema
>;

/** ゲスト / 会員の申込内容セルフ編集フォーム用スキーマ。 */
export const eventRegistrationEditSchema = eventRegistrationBaseSchema.extend({
  registrationId: entityIdSchema("EventRegistration"),
  quantity: z
    .number()
    .int()
    .min(1, { error: "参加人数は1以上です" })
    .max(10, { error: "参加人数は10名以下です" }),
  // eslint-disable-next-line local/require-trimmed-text -- 同上
  turnstileToken: z
    .string({ error: "セキュリティ検証が必要です" })
    .min(1, { error: "セキュリティ検証が必要です" }),
});

export type EventRegistrationEditInput = z.infer<
  typeof eventRegistrationEditSchema
>;

export const adminEventRegistrationSchema = eventRegistrationBaseSchema.extend({
  quantity: z.number().int().min(1, { error: "参加人数は1以上です" }),
});

export type AdminEventRegistrationInput = z.infer<
  typeof adminEventRegistrationSchema
>;
