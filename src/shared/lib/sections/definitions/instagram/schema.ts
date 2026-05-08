import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

const gaps = ["sm", "md", "lg"] as const;

export const instagramConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "Follow Us",
    maxLength: 50,
    subGroup: "text",
  }),
  title: field.portableTextInline("見出し", {
    subGroup: "text",
  }),
  columns: field.number("1 行あたりの列数", {
    min: 3,
    max: 6,
    default: 6,
    suffix: "列",
    group: "design",
  }),
  count: field.number("表示件数", {
    min: 6,
    max: 12,
    default: 6,
    suffix: "件",
    group: "advanced",
  }),
  gap: field.select("画像の間隔", {
    options: gaps,
    default: "md",
    group: "design",
  }),
  layout: sectionLayoutSchema,
});

export type InstagramConfig = z.infer<typeof instagramConfigSchema>;
