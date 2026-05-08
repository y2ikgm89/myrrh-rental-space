import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

const layouts = ["grid", "list", "carousel", "catalog"] as const;
const cardStyles = ["bordered", "shadow", "minimal"] as const;
const imageAspects = ["4:3", "3:2", "16:9"] as const;

export const spaceListConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "Spaces",
    maxLength: 50,
    subGroup: "text",
  }),
  title: field.portableTextInline("見出し", {
    subGroup: "text",
  }),
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
  viewAllText: field.text("「すべて見る」リンクの文字", {
    default: "全てのスペースを見る",
    maxLength: 50,
    subGroup: "button",
  }),
  viewAllUrl: field.text("「すべて見る」リンク先 URL", {
    default: "/spaces",
    maxLength: 200,
    subGroup: "button",
  }),
  displayLayout: field.select("表示レイアウト", {
    options: layouts,
    default: "grid",
    group: "design",
    helpText:
      "スペース一覧の並び方。catalog はフィルタとページネーション付きのアーカイブ表示",
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
  layout: sectionLayoutSchema,
});

export type SpaceListConfig = z.infer<typeof spaceListConfigSchema>;
