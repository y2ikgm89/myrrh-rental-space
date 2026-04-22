import { z } from "zod";

import { field } from "../../field-registry";

const layouts = ["hero-first", "equal-grid", "icon-left"] as const;

export const featuresConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Features" })
    .pipe(z.string().max(50)),
  title: field
    .text("タイトル", { default: "Features" })
    .pipe(z.string().max(100)),
  items: field.array("特徴", {
    fields: {
      icon: field.icon("アイコン"),
      title: field.text("タイトル"),
      description: field.textarea("説明"),
    },
  }),
  columns: field.number("カラム数", {
    min: 1,
    max: 4,
    default: 3,
    group: "design",
  }),
  layout: field.select("レイアウト", {
    options: layouts,
    default: "hero-first",
    group: "design",
  }),
});

export type FeaturesConfig = z.infer<typeof featuresConfigSchema>;
