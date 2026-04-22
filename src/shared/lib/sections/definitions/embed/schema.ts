import { z } from "zod";

import { field } from "../../field-registry";

const aspectRatios = ["16:9", "4:3", "1:1", "auto"] as const;
const maxWidths = ["sm", "md", "lg", "xl", "full"] as const;
const borderRadii = ["none", "sm", "lg"] as const;

export const embedConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Media" })
    .pipe(z.string().max(50)),
  title: field.text("見出し").pipe(z.string().max(100)),
  embedUrl: field.url("埋め込み URL"),
  embedCode: field.textarea("埋め込みコード").pipe(z.string().max(10000)),
  aspectRatio: field.select("アスペクト比", {
    options: aspectRatios,
    default: "16:9",
    group: "design",
  }),
  maxWidth: field.select("最大幅", {
    options: maxWidths,
    default: "lg",
    group: "design",
  }),
  borderRadius: field.select("角丸", {
    options: borderRadii,
    default: "sm",
    group: "design",
  }),
});

export type EmbedConfig = z.infer<typeof embedConfigSchema>;
