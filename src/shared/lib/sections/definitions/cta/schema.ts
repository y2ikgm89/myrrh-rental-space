import { z } from "zod";

import { field } from "../../field-registry";
import { createButtonsArraySchema } from "../_shared/buttons";
import { sectionLayoutSchema } from "../_shared/layout";

const variants = ["default", "centered", "split"] as const;

export const ctaConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "Ready to Begin?",
    maxLength: 50,
    subGroup: "text",
  }),
  title: field.portableTextInline("見出し", { subGroup: "text" }),
  description: field.textarea("説明文", { maxLength: 500, subGroup: "text" }),
  buttons: createButtonsArraySchema("ボタン"),
  backgroundColor: field.color("背景色", { group: "design" }),
  variant: field.select("レイアウトの種類", {
    options: variants,
    default: "default",
    group: "design",
  }),
  layout: sectionLayoutSchema,
});

export type CtaConfig = z.infer<typeof ctaConfigSchema>;
