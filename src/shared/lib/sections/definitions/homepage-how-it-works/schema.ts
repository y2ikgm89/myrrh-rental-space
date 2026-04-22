import { z } from "zod";
import { field } from "../../field-registry";

export const homepageHowItWorksConfigSchema = z.object({
  label: field.text("ラベル", { default: "How to Reserve" }),
  title: field.text("見出し", { default: "ご利用の流れ" }),
  steps: field.array("ステップ", {
    fields: {
      title: field.text("ステップの見出し"),
      description: field.text("説明文"),
    },
  }),
  valueProps: field.array("アピールポイント", {
    fields: {
      title: field.text("テキスト"),
    },
  }),
});

export type HomepageHowItWorksConfig = z.infer<
  typeof homepageHowItWorksConfigSchema
>;
