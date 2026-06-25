import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";
import { listSectionHeaderFields } from "../_shared/list-header";

const variants = ["default", "bordered", "minimal"] as const;
const initialOpenOptions = ["first", "none", "all"] as const;

export const faqListConfigSchema = z.object({
  ...listSectionHeaderFields({
    sectionLabelDefault: "FAQ",
    defaultViewAllUrl: "/faq",
    maxItemsCap: 50,
    maxItemsDefault: 10,
  }),
  categoryId: field.dynamicSelect("カテゴリで絞り込み", {
    source: "faqCategories",
    subGroup: "other",
    helpText: "未指定の場合、全カテゴリのFAQを表示",
  }),
  items: field
    .array("カスタム項目", {
      subGroup: "text",
      fields: {
        question: field.portableTextInline("質問"),
        answer: field.portableTextBlock("回答"),
      },
    })
    .optional(),
  variant: field.select("レイアウトの種類", {
    options: variants,
    default: "default",
    group: "design",
  }),
  initialOpen: field.select("初期展開状態", {
    options: initialOpenOptions,
    default: "first",
    group: "advanced",
  }),
  layout: sectionLayoutSchema,
});

export type FaqListConfig = z.infer<typeof faqListConfigSchema>;
