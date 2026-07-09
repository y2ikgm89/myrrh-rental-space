import { z } from "zod";

import { field } from "../../field-registry";
import { createButtonsArraySchema } from "../_shared/buttons";
import { sectionLayoutSchema } from "../_shared/layout";
import { sectionHeaderFields } from "../_shared/section-header";

const variants = ["default", "centered", "split"] as const;

export const ctaConfigSchema = z.strictObject({
  ...sectionHeaderFields({ sectionLabelDefault: "Ready to Begin?" }),
  description: field.portableTextBlock("説明文", { subGroup: "text" }),
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
