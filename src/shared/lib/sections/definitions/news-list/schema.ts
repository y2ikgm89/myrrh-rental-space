import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";
import { listSectionHeaderFields } from "../_shared/list-header";

const layouts = ["list", "card", "archive"] as const;

export const newsListConfigSchema = z.object({
  ...listSectionHeaderFields({
    sectionLabelDefault: "News",
    defaultViewAllUrl: "/news",
    maxItemsCap: 20,
    maxItemsDefault: 5,
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
