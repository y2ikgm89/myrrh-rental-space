import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

const layouts = ["list", "card", "archive"] as const;

export const newsListConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "News",
    maxLength: 50,
    subGroup: "text",
  }),
  title: field.portableTextInline("見出し", {
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
  displayLayout: field.select("表示レイアウト", {
    options: layouts,
    default: "list",
    group: "design",
    helpText:
      "お知らせの並び方。archive は検索 + ページネーション付きのアーカイブ表示",
  }),
  columns: field.number("1 行あたりの列数", {
    min: 2,
    max: 4,
    default: 2,
    suffix: "列",
    group: "design",
  }),
  layout: sectionLayoutSchema,
});

export type NewsListConfig = z.infer<typeof newsListConfigSchema>;
