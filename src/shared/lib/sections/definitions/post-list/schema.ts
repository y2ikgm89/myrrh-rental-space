import { z } from "zod";

import { field } from "../../field-helpers";

const layouts = ["grid", "list"] as const;
const imageAspects = ["16:9", "4:3", "1:1"] as const;

export const postListConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Blog" })
    .pipe(z.string().max(50)),
  title: field
    .text("タイトル", { default: "最新の記事" })
    .pipe(z.string().max(100)),
  maxItems: field.number("最大表示件数", { min: 1, max: 20, default: 6 }),
  showViewAllLink: field.boolean("全件リンクを表示", { default: true }),
  viewAllText: field
    .text("全件リンクテキスト", { default: "全ての記事" })
    .pipe(z.string().max(50)),
  viewAllUrl: field
    .text("全件リンクURL", { default: "/posts" })
    .pipe(z.string().max(200)),
  categoryId: z
    .string()
    .uuid({ error: "有効なUUIDを入力してください" })
    .optional(),
  layout: field.select("レイアウト", {
    options: layouts,
    default: "grid",
  }),
  columns: field.number("カラム数", { min: 1, max: 4, default: 3 }),
  imageAspect: field.select("画像アスペクト比", {
    options: imageAspects,
    default: "16:9",
  }),
});

export type PostListConfig = z.infer<typeof postListConfigSchema>;
