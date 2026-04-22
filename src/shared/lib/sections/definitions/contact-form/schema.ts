import { z } from "zod";

import { field } from "../../field-registry";

const variants = ["default", "minimal", "split"] as const;

export const contactFormConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Contact" })
    .pipe(z.string().max(50)),
  title: field
    .text("タイトル", { default: "お問い合わせ" })
    .pipe(z.string().max(100)),
  description: field.textarea("説明").pipe(z.string().max(500)),
  showNameField: field.boolean("名前フィールドを表示", { default: true }),
  showPhoneField: field.boolean("電話番号フィールドを表示", { default: true }),
  showSubjectField: field.boolean("件名フィールドを表示", { default: true }),
  submitButtonText: field
    .text("送信ボタンテキスト", { default: "送信する" })
    .pipe(z.string().max(30)),
  variant: field.select("バリエーション", {
    options: variants,
    default: "default",
    group: "design",
  }),
});

export type ContactFormConfig = z.infer<typeof contactFormConfigSchema>;
