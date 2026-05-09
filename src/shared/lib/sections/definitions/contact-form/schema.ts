import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

const variants = ["default", "minimal", "split"] as const;

export const contactFormConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "Contact",
    maxLength: 50,
    subGroup: "text",
  }),
  title: field.portableTextInline("見出し", {
    subGroup: "text",
  }),
  description: field.textarea("説明文", { maxLength: 500, subGroup: "text" }),
  showNameField: field.boolean("名前フィールドを表示する", { default: true }),
  showPhoneField: field.boolean("電話番号フィールドを表示する", {
    default: true,
  }),
  showSubjectField: field.boolean("件名フィールドを表示する", {
    default: true,
  }),
  submitButtonText: field.portableTextInline("送信ボタンの文字", {
    subGroup: "button",
  }),
  variant: field.select("レイアウトの種類", {
    options: variants,
    default: "default",
    group: "design",
  }),
  layout: sectionLayoutSchema,
});

export type ContactFormConfig = z.infer<typeof contactFormConfigSchema>;
