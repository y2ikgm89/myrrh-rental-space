import { z } from "zod";

import { field } from "../../field-registry";

const layouts = ["list", "card"] as const;

export const newsListConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "News" })
    .pipe(z.string().max(50)),
  title: field
    .text("タイトル", { default: "お知らせ" })
    .pipe(z.string().max(100)),
  maxItems: field.number("最大表示件数", {
    min: 1,
    max: 20,
    default: 5,
    group: "advanced",
  }),
  showViewAllLink: field.boolean("全件リンクを表示", { default: true }),
  viewAllText: field
    .text("全件リンクテキスト", { default: "全てのお知らせ" })
    .pipe(z.string().max(50)),
  viewAllUrl: field
    .text("全件リンクURL", { default: "/news" })
    .pipe(z.string().max(200)),
  layout: field.select("レイアウト", {
    options: layouts,
    default: "list",
    group: "design",
  }),
  columns: field.number("カラム数", {
    min: 2,
    max: 4,
    default: 2,
    group: "design",
  }),
});

export type NewsListConfig = z.infer<typeof newsListConfigSchema>;
