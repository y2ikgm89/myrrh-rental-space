import { z } from "zod";

const eventRegistrationBaseSchema = z.object({
  eventId: z.string().uuid({ error: "イベントIDは必須です" }),
  ticketId: z.string().min(1, { error: "チケット種別は必須です" }),
  name: z
    .string()
    .min(1, { error: "お名前は必須です" })
    .max(100, { error: "お名前は100文字以内です" }),
  email: z.string().email({ error: "有効なメールアドレスを入力してください" }),
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
