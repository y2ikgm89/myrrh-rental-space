import { z } from "zod";
import type { SectionMeta } from "@/shared/lib/sections/admin-registry";
import {
  postLayoutValues,
  postImageAspectValues,
} from "@/shared/lib/validations/section-options";

export const postListConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Blog")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("最新の記事")
    .meta({ description: "タイトル", fieldType: "text" }),
  maxItems: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(6)
    .meta({ description: "最大表示数" }),
  showViewAllLink: z
    .boolean()
    .default(true)
    .meta({ description: "「すべて見る」リンクを表示する" }),
  viewAllText: z
    .string()
    .max(50, { error: "テキストは50文字以内です" })
    .default("全ての記事")
    .meta({ description: "「すべて見る」テキスト", fieldType: "text" }),
  viewAllUrl: z
    .string()
    .max(200, { error: "URLは200文字以内です" })
    .default("/posts")
    .meta({ description: "「すべて見る」URL", fieldType: "text" }),
  categoryId: z
    .string()
    .uuid()
    .optional()
    .meta({ description: "カテゴリID（絞り込み）", fieldType: "text" }),
  layout: z
    .enum(postLayoutValues)
    .default("grid")
    .meta({ description: "レイアウト", fieldType: "select" }),
  columns: z
    .number()
    .int()
    .min(1)
    .max(4)
    .default(3)
    .meta({ description: "列数" }),
  imageAspect: z
    .enum(postImageAspectValues)
    .default("16:9")
    .meta({ description: "画像アスペクト比", fieldType: "select" }),
});

export type PostListConfig = z.output<typeof postListConfigSchema>;

export const postListMeta: SectionMeta<typeof postListConfigSchema> = {
  id: "post-list",
  meta: {
    label: "記事一覧",
    description: "ブログ記事一覧を表示します。",
    icon: "FileEdit",
    category: "list",
  },
  configSchema: postListConfigSchema,
  defaultConfig: postListConfigSchema.parse({}),
};
