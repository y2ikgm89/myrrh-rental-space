import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

const cardStyles = ["bordered", "shadow", "minimal"] as const;
const imageAspects = ["4:3", "3:2", "16:9", "1:1"] as const;
const displayLayouts = ["grid", "carousel"] as const;

export const spaceShowcaseConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "Spaces",
    maxLength: 50,
    subGroup: "text",
  }),
  title: field.text("見出し", {
    default: "Our Spaces",
    maxLength: 100,
    subGroup: "text",
  }),
  maxItems: field.number("最大表示件数", {
    min: 1,
    max: 12,
    default: 3,
    suffix: "件",
    group: "advanced",
  }),
  showOnlyPublished: field.boolean("公開済みスペースのみ表示する", {
    default: true,
    group: "advanced",
  }),
  displayLayout: field.select("レイアウト", {
    options: displayLayouts,
    default: "grid",
    group: "design",
    helpText: "grid: 特集 + グリッド / carousel: 重なりカードカルーセル",
  }),
  autoPlayInterval: field.number("オートプレイ間隔（秒）", {
    min: 0,
    max: 30,
    default: 5,
    suffix: "秒",
    group: "design",
    helpText:
      "carousel レイアウト時のみ有効。0 で停止。3 秒以上推奨。reduced-motion 設定時は自動で停止します。",
  }),
  columns: field.number("1 行あたりの列数", {
    min: 2,
    max: 4,
    default: 3,
    suffix: "列",
    group: "design",
    helpText: "grid レイアウト時のみ有効",
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

export type SpaceShowcaseConfig = z.infer<typeof spaceShowcaseConfigSchema>;
