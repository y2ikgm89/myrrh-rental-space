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

export const adminEventRegistrationSchema = eventRegistrationBaseSchema.extend({
  quantity: z.number().int().min(1, { error: "参加人数は1以上です" }),
});

export type AdminEventRegistrationInput = z.infer<
  typeof adminEventRegistrationSchema
>;
