import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

export const customConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "Contents",
    maxLength: 50,
    subGroup: "text",
  }),
  containerClass: field.text("カスタム CSS クラス", { group: "advanced" }),
  backgroundColor: field.color("背景色", { group: "design" }),
  layout: sectionLayoutSchema,
});

export type CustomConfig = z.infer<typeof customConfigSchema>;
