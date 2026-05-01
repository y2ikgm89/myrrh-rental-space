import { z } from "zod";

import { field } from "../../field-registry";

const maxWidthOptions = ["sm", "md", "lg", "xl", "full"] as const;
const paddingOptions = ["none", "sm", "md", "lg"] as const;

export const customConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "Contents",
    maxLength: 50,
    subGroup: "text",
  }),
  maxWidth: field.select("最大幅", {
    options: maxWidthOptions,
    default: "lg",
    group: "design",
  }),
  containerClass: field.text("カスタム CSS クラス", { group: "advanced" }),
  backgroundColor: field.color("背景色", { group: "design" }),
  padding: field.select("内側の余白", {
    options: paddingOptions,
    default: "md",
    group: "design",
  }),
});

export type CustomConfig = z.infer<typeof customConfigSchema>;
