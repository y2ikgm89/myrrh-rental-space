import { z } from "zod";

import { field } from "../../field-helpers";

const buttonVariants = ["primary", "secondary", "outline"] as const;
const variants = ["default", "centered", "split"] as const;

export const ctaConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Ready to Begin?" })
    .pipe(z.string().max(50)),
  title: field.text("タイトル").pipe(z.string().max(100)),
  description: field.textarea("説明").pipe(z.string().max(500)),
  buttons: field.array("ボタン", {
    fields: {
      text: field.text("テキスト"),
      url: field.url("リンク先"),
      variant: field.select("スタイル", {
        options: buttonVariants,
        default: "primary",
      }),
      openInNewTab: field.boolean("新しいタブで開く"),
    },
  }),
  backgroundColor: field.color("背景色"),
  variant: field.select("バリエーション", {
    options: variants,
    default: "default",
  }),
});

export type CtaConfig = z.infer<typeof ctaConfigSchema>;
