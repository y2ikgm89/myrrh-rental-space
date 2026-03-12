import { z } from "zod";
import type { SectionMeta } from "@/shared/lib/sections/admin-registry";
import {
  spaceLayoutValues,
  cardStyleValues,
  spaceImageAspectValues,
} from "@/shared/lib/validations/section-options";

export const spaceListConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Spaces")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("スペース一覧")
    .meta({ description: "タイトル", fieldType: "text" }),
  maxItems: z
    .number()
    .int()
    .min(1)
    .max(24)
    .default(6)
    .meta({ description: "最大表示数" }),
  showOnlyPublished: z
    .boolean()
    .default(true)
    .meta({ description: "公開中のみ表示する" }),
  showViewAllLink: z
    .boolean()
    .default(true)
    .meta({ description: "「すべて見る」リンクを表示する" }),
  viewAllText: z
    .string()
    .max(50, { error: "テキストは50文字以内です" })
    .default("全てのスペースを見る")
    .meta({ description: "「すべて見る」テキスト", fieldType: "text" }),
  viewAllUrl: z
    .string()
    .max(200, { error: "URLは200文字以内です" })
    .default("/spaces")
    .meta({ description: "「すべて見る」URL", fieldType: "text" }),
  layout: z
    .enum(spaceLayoutValues)
    .default("grid")
    .meta({ description: "レイアウト", fieldType: "select" }),
  columns: z
    .number()
    .int()
    .min(1)
    .max(4)
    .default(3)
    .meta({ description: "列数" }),
  cardStyle: z
    .enum(cardStyleValues)
    .default("bordered")
    .meta({ description: "カードスタイル", fieldType: "select" }),
  imageAspect: z
    .enum(spaceImageAspectValues)
    .default("4:3")
    .meta({ description: "画像アスペクト比", fieldType: "select" }),
});

export type SpaceListConfig = z.output<typeof spaceListConfigSchema>;

export const spaceListMeta: SectionMeta<typeof spaceListConfigSchema> = {
  id: "space-list",
  meta: {
    label: "スペース一覧",
    description: "スペース一覧をグリッド形式で表示します。",
    icon: "LayoutGrid",
    category: "list",
  },
  configSchema: spaceListConfigSchema,
  defaultConfig: spaceListConfigSchema.parse({}),
};
