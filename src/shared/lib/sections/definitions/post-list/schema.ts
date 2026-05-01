import { z } from "zod";

import { field } from "../../field-registry";

const layouts = ["grid", "list"] as const;
const imageAspects = ["16:9", "4:3", "1:1"] as const;

export const postListConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "Blog",
    maxLength: 50,
    subGroup: "text",
  }),
  title: field.text("見出し", {
    default: "最新の記事",
    maxLength: 100,
    subGroup: "text",
  }),
  maxItems: field.number("最大表示件数", {
    min: 1,
    max: 20,
    default: 6,
    suffix: "件",
    group: "advanced",
  }),
  showViewAllLink: field.boolean("「すべて見る」リンクを表示する", {
    default: true,
  }),
  viewAllText: field.text("「すべて見る」リンクの文字", {
    default: "全ての記事",
    maxLength: 50,
    subGroup: "button",
  }),
  viewAllUrl: field.text("「すべて見る」リンク先 URL", {
    default: "/posts",
    maxLength: 200,
    subGroup: "button",
  }),
  categoryId: z
    .string()
    .uuid({ error: "有効なUUIDを入力してください" })
    .optional(),
  layout: field.select("レイアウト", {
    options: layouts,
    default: "grid",
    group: "design",
  }),
  columns: field.number("1 行あたりの列数", {
    min: 1,
    max: 4,
    default: 3,
    suffix: "列",
    group: "design",
  }),
  imageAspect: field.select("画像のアスペクト比", {
    options: imageAspects,
    default: "16:9",
    group: "design",
  }),
});

export type PostListConfig = z.infer<typeof postListConfigSchema>;
