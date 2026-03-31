import { z } from "zod";

import { field } from "../../field-helpers";

const cardStyles = ["bordered", "shadow", "minimal"] as const;
const imageAspects = ["4:3", "3:2", "16:9", "1:1"] as const;

export const spaceShowcaseConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Spaces" })
    .pipe(z.string().max(50)),
  title: field
    .text("タイトル", { default: "Our Spaces" })
    .pipe(z.string().max(100)),
  maxItems: field.number("最大表示件数", { min: 1, max: 12, default: 3 }),
  showOnlyPublished: field.boolean("公開済みのみ", { default: true }),
  columns: field.number("カラム数", { min: 2, max: 4, default: 3 }),
  cardStyle: field.select("カードスタイル", {
    options: cardStyles,
    default: "bordered",
  }),
  imageAspect: field.select("画像アスペクト比", {
    options: imageAspects,
    default: "4:3",
  }),
});

export type SpaceShowcaseConfig = z.infer<typeof spaceShowcaseConfigSchema>;
