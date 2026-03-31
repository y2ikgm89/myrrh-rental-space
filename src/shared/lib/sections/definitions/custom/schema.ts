import { z } from "zod";

import { field } from "../../field-helpers";

const maxWidthOptions = ["sm", "md", "lg", "xl", "full"] as const;
const paddingOptions = ["none", "sm", "md", "lg"] as const;

export const customConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Contents" })
    .pipe(z.string().max(50)),
  maxWidth: field.select("最大幅", {
    options: maxWidthOptions,
    default: "lg",
  }),
  containerClass: field.text("コンテナクラス"),
  backgroundColor: field.color("背景色"),
  padding: field.select("パディング", {
    options: paddingOptions,
    default: "md",
  }),
});

export type CustomConfig = z.infer<typeof customConfigSchema>;
