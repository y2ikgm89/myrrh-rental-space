import { z } from "zod";

export const emailTemplateFormSchema = z.object({
  subject: z
    .string()
    .min(1, { error: "件名は必須です" })
    .max(256, { error: "件名は 256 文字以内で入力してください" }),
  greeting: z
    .string()
    .min(1, { error: "挨拶文は必須です" })
    .max(256, { error: "挨拶文は 256 文字以内で入力してください" }),
  intro: z
    .string()
    .min(1, { error: "導入文は必須です" })
    .max(4000, { error: "導入文は 4000 文字以内で入力してください" }),
  outro: z
    .string()
    .min(1, { error: "締め文は必須です" })
    .max(4000, { error: "締め文は 4000 文字以内で入力してください" }),
  enabled: z.boolean(),
});

export type EmailTemplateFormInput = z.infer<typeof emailTemplateFormSchema>;

export const sendTestEmailSchema = z.object({
  type: z.string().min(1),
  subject: z.string().min(1).max(256),
  greeting: z.string().min(1).max(256),
  intro: z.string().min(1).max(4000),
  outro: z.string().min(1).max(4000),
});

export type SendTestEmailInput = z.infer<typeof sendTestEmailSchema>;
