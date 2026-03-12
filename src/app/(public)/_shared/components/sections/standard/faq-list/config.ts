import { z } from "zod";
import type { SectionMeta } from "@/shared/lib/sections/admin-registry";
import {
  faqVariantValues,
  containerWidthValues,
  faqInitialOpenValues,
} from "@/shared/lib/validations/section-options";

export const faqListConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("FAQ")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("よくあるご質問")
    .meta({ description: "タイトル", fieldType: "text" }),
  categoryId: z
    .string()
    .uuid()
    .optional()
    .meta({ description: "カテゴリID（絞り込み）", fieldType: "text" }),
  maxItems: z
    .number()
    .int()
    .min(1)
    .max(50)
    .default(10)
    .meta({ description: "最大表示数" }),
  showViewAllLink: z
    .boolean()
    .default(true)
    .meta({ description: "「すべて見る」リンクを表示する" }),
  viewAllText: z
    .string()
    .max(50, { error: "テキストは50文字以内です" })
    .default("全てのFAQ")
    .meta({ description: "「すべて見る」テキスト", fieldType: "text" }),
  viewAllUrl: z
    .string()
    .max(200, { error: "URLは200文字以内です" })
    .default("/faq")
    .meta({ description: "「すべて見る」URL", fieldType: "text" }),
  items: z
    .array(
      z.object({
        question: z
          .string()
          .min(1, { error: "質問は必須です" })
          .max(200, { error: "質問は200文字以内です" }),
        answer: z
          .string()
          .min(1, { error: "回答は必須です" })
          .max(5000, { error: "回答は5000文字以内です" }),
      }),
    )
    .optional()
    .meta({ description: "手動入力FAQ項目", fieldType: "array" }),
  variant: z
    .enum(faqVariantValues)
    .default("default")
    .meta({ description: "バリエーション", fieldType: "select" }),
  containerWidth: z
    .enum(containerWidthValues)
    .default("md")
    .meta({ description: "コンテナ幅", fieldType: "select" }),
  initialOpen: z
    .enum(faqInitialOpenValues)
    .default(faqInitialOpenValues[1])
    .meta({ description: "初期開閉状態", fieldType: "select" }),
});

export type FaqListConfig = z.output<typeof faqListConfigSchema>;

export const faqListMeta: SectionMeta<typeof faqListConfigSchema> = {
  id: "faq-list",
  meta: {
    label: "よくあるご質問",
    description: "よくある質問と回答をアコーディオン形式で表示します。",
    icon: "HelpCircle",
    category: "list",
  },
  configSchema: faqListConfigSchema,
  defaultConfig: faqListConfigSchema.parse({}),
};
