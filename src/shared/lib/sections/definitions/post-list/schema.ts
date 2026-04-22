import { z } from "zod";

import { field } from "../../field-registry";

const layouts = ["grid", "list"] as const;
const imageAspects = ["16:9", "4:3", "1:1"] as const;

export const postListConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Blog" })
    .pipe(z.string().max(50)),
  title: field
    .text("見出し", { default: "最新の記事" })
    .pipe(z.string().max(100)),
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
  viewAllText: field
    .text("「すべて見る」リンクの文字", { default: "全ての記事" })
    .pipe(z.string().max(50)),
  viewAllUrl: field
    .text("「すべて見る」リンク先 URL", { default: "/posts" })
    .pipe(z.string().max(200)),
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
