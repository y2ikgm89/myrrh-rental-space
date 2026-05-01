import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

const cardStyles = ["bordered", "shadow", "minimal"] as const;
const imageAspects = ["4:3", "3:2", "16:9", "1:1"] as const;

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
  columns: field.number("1 行あたりの列数", {
    min: 2,
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

export type SpaceShowcaseConfig = z.infer<typeof spaceShowcaseConfigSchema>;
