import { z } from "zod";

import { field } from "../../field-registry";

const layouts = ["list", "card"] as const;

export const newsListConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "News",
    maxLength: 50,
    subGroup: "text",
  }),
  title: field.text("見出し", {
    default: "お知らせ",
    maxLength: 100,
    subGroup: "text",
  }),
  maxItems: field.number("最大表示件数", {
    min: 1,
    max: 20,
    default: 5,
    suffix: "件",
    group: "advanced",
  }),
  showViewAllLink: field.boolean("「すべて見る」リンクを表示する", {
    default: true,
  }),
  viewAllText: field.text("「すべて見る」リンクの文字", {
    default: "全てのお知らせ",
    maxLength: 50,
    subGroup: "button",
  }),
  viewAllUrl: field.text("「すべて見る」リンク先 URL", {
    default: "/news",
    maxLength: 200,
    subGroup: "button",
  }),
  layout: field.select("レイアウト", {
    options: layouts,
    default: "list",
    group: "design",
  }),
  columns: field.number("1 行あたりの列数", {
    min: 2,
    max: 4,
    default: 2,
    suffix: "列",
    group: "design",
  }),
});

export type NewsListConfig = z.infer<typeof newsListConfigSchema>;
