import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

const itemLayouts = ["hero-first", "equal-grid", "icon-left"] as const;
const displayLayouts = [
  "grid",
  "numbered-steps",
  "numbered-editorial",
] as const;

export const featuresConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "Features",
    maxLength: 50,
    subGroup: "text",
  }),
  title: field.portableTextInline("見出し", {
    subGroup: "text",
  }),
  items: field.array("特徴", {
    subGroup: "text",
    fields: {
      icon: field.icon("アイコン"),
      title: field.text("項目の見出し"),
      description: field.textarea("説明文"),
    },
  }),
  displayLayout: field.select("レイアウト", {
    options: displayLayouts,
    default: "numbered-editorial",
    group: "design",
    helpText:
      "grid: アイコン付きカードグリッド / numbered-steps: 番号付き 3 ステップ + アイコン中央配置 / numbered-editorial: 番号付き divide-y 構造化リスト",
  }),
  columns: field.number("1 行あたりの列数", {
    min: 1,
    max: 4,
    default: 3,
    suffix: "列",
    group: "design",
    helpText: "grid レイアウト時のみ有効",
  }),
  itemLayout: field.select("アイテムレイアウト", {
    options: itemLayouts,
    default: "hero-first",
    group: "design",
    helpText: "grid レイアウト時のみ有効",
  }),
  layout: sectionLayoutSchema,
});

export type FeaturesConfig = z.infer<typeof featuresConfigSchema>;
