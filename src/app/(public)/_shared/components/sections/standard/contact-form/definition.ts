import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import { contactFormVariantValues } from "@/shared/lib/validations/section-options";

export const contactFormConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Contact")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("お問い合わせ")
    .meta({ description: "タイトル", fieldType: "text" }),
  description: z
    .string()
    .max(500, { error: "説明は500文字以内です" })
    .optional()
    .meta({ description: "説明文", fieldType: "textarea" }),
  showNameField: z
    .boolean()
    .default(true)
    .meta({ description: "名前フィールドを表示する" }),
  showPhoneField: z
    .boolean()
    .default(true)
    .meta({ description: "電話番号フィールドを表示する" }),
  showSubjectField: z
    .boolean()
    .default(true)
    .meta({ description: "件名フィールドを表示する" }),
  submitButtonText: z
    .string()
    .max(30)
    .default("送信する")
    .meta({ description: "送信ボタンテキスト", fieldType: "text" }),
  variant: z
    .enum(contactFormVariantValues)
    .default("default")
    .meta({ description: "バリエーション", fieldType: "select" }),
});

export type ContactFormConfig = z.output<typeof contactFormConfigSchema>;

export const contactFormDefinition: SectionDefinition<
  typeof contactFormConfigSchema
> = {
  id: "contact-form",
  meta: {
    label: "お問い合わせフォーム",
    description: "お問い合わせフォームを表示します。",
    icon: "Mail",
    category: "interactive",
  },
  configSchema: contactFormConfigSchema,
  defaultConfig: contactFormConfigSchema.parse({}),
  component: {
    type: "server",
    load: () =>
      import("../../../../../_components/ContactFormSection").then((m) => ({
        default: m.ContactFormSection,
      })),
  },
};
