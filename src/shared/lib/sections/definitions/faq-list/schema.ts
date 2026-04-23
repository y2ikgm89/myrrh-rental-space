import { z } from "zod";

import { field } from "../../field-registry";

const variants = ["default", "bordered", "minimal"] as const;
const containerWidths = ["sm", "md", "lg", "full"] as const;
const initialOpenOptions = ["first", "none", "all"] as const;

export const faqListConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "FAQ",
    maxLength: 50,
  }),
  title: field.text("見出し", {
    default: "よくあるご質問",
    maxLength: 100,
  }),
  categoryId: z
    .string()
    .uuid({ error: "有効なUUIDを入力してください" })
    .optional(),
  maxItems: field.number("最大表示件数", {
    min: 1,
    max: 50,
    default: 10,
    suffix: "件",
    group: "advanced",
  }),
  showViewAllLink: field.boolean("「すべて見る」リンクを表示する", {
    default: true,
  }),
  viewAllText: field.text("「すべて見る」リンクの文字", {
    default: "全てのFAQ",
    maxLength: 50,
  }),
  viewAllUrl: field.text("「すべて見る」リンク先 URL", {
    default: "/faq",
    maxLength: 200,
  }),
  items: field
    .array("カスタム項目", {
      fields: {
        question: field.text("質問"),
        answer: field.textarea("回答"),
      },
    })
    .optional(),
  variant: field.select("レイアウトの種類", {
    options: variants,
    default: "default",
    group: "design",
  }),
  containerWidth: field.select("コンテナ幅", {
    options: containerWidths,
    default: "md",
    group: "design",
  }),
  initialOpen: field.select("初期展開状態", {
    options: initialOpenOptions,
    default: "first",
    group: "advanced",
  }),
});

export type FaqListConfig = z.infer<typeof faqListConfigSchema>;
