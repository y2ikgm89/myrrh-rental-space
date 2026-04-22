import { z } from "zod";

import { field } from "../../field-registry";

const layouts = ["grid", "list", "carousel"] as const;
const cardStyles = ["bordered", "shadow", "minimal"] as const;
const imageAspects = ["4:3", "3:2", "16:9"] as const;

export const spaceListConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Spaces" })
    .pipe(z.string().max(50)),
  title: field
    .text("見出し", { default: "スペース一覧" })
    .pipe(z.string().max(100)),
  maxItems: field.number("最大表示件数", {
    min: 1,
    max: 24,
    default: 6,
    suffix: "件",
    group: "advanced",
  }),
  showOnlyPublished: field.boolean("公開済みスペースのみ表示する", {
    default: true,
    group: "advanced",
  }),
  showViewAllLink: field.boolean("「すべて見る」リンクを表示する", {
    default: true,
  }),
  viewAllText: field
    .text("「すべて見る」リンクの文字", { default: "全てのスペースを見る" })
    .pipe(z.string().max(50)),
  viewAllUrl: field
    .text("「すべて見る」リンク先 URL", { default: "/spaces" })
    .pipe(z.string().max(200)),
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
  cardStyle: field.select("カードの見た目", {
    options: cardStyles,
    default: "bordered",
    group: "design",
  }),
  imageAspect: field.select("画像のアスペクト比", {
    options: imageAspects,
    default: "4:3",
    group: "design",
  }),
});

export type SpaceListConfig = z.infer<typeof spaceListConfigSchema>;
