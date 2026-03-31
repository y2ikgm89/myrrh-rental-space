import { z } from "zod";

import { field } from "../../field-helpers";

const gaps = ["sm", "md", "lg"] as const;

export const instagramConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Follow Us" })
    .pipe(z.string().max(50)),
  title: field
    .text("タイトル", { default: "Instagram" })
    .pipe(z.string().max(100)),
  columns: field.number("カラム数", { min: 3, max: 6, default: 6 }),
  count: field.number("表示件数", { min: 6, max: 12, default: 6 }),
  gap: field.select("間隔", {
    options: gaps,
    default: "md",
  }),
});

export type InstagramConfig = z.infer<typeof instagramConfigSchema>;
