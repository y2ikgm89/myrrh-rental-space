import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import { newsLayoutValues } from "@/shared/lib/validations/section-options";
import { getPublishedNews } from "@/shared/domain/news/queries";

export const newsListConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("News")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("お知らせ")
    .meta({ description: "タイトル", fieldType: "text" }),
  maxItems: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(5)
    .meta({ description: "最大表示数" }),
  showViewAllLink: z
    .boolean()
    .default(true)
    .meta({ description: "「すべて見る」リンクを表示する" }),
  viewAllText: z
    .string()
    .max(50, { error: "テキストは50文字以内です" })
    .default("全てのお知らせ")
    .meta({ description: "「すべて見る」テキスト", fieldType: "text" }),
  viewAllUrl: z
    .string()
    .max(200, { error: "URLは200文字以内です" })
    .default("/news")
    .meta({ description: "「すべて見る」URL", fieldType: "text" }),
  layout: z
    .enum(newsLayoutValues)
    .default("list")
    .meta({ description: "レイアウト", fieldType: "select" }),
  columns: z
    .number()
    .int()
    .min(2)
    .max(4)
    .default(2)
    .meta({ description: "列数（カードレイアウト時）" }),
});

export type NewsListConfig = z.output<typeof newsListConfigSchema>;

export const newsListDefinition: SectionDefinition<
  typeof newsListConfigSchema
> = {
  id: "news-list",
  meta: {
    label: "お知らせ一覧",
    description: "お知らせ一覧を表示します。",
    icon: "Newspaper",
    category: "list",
  },
  configSchema: newsListConfigSchema,
  defaultConfig: newsListConfigSchema.parse({}),
  component: {
    type: "server",
    load: () =>
      // @ts-expect-error -- migration: component uses typed props; will adopt SectionComponentProps<TConfig> in Task 13
      import("../../../../../_components/NewsListSection").then((m) => ({
        default: m.NewsListSection,
      })),
  },
  dataLoader: async (config) => {
    const news = await getPublishedNews(config.maxItems);
    return { news };
  },
};
