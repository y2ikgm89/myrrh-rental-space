import { z } from "zod";

import { field } from "../../field-registry";

const buttonVariants = ["primary", "secondary", "outline"] as const;
const variants = ["default", "centered", "split"] as const;

export const ctaConfigSchema = z
  .object({
    sectionLabel: field.text("セクションラベル", {
      default: "Ready to Begin?",
      maxLength: 50,
      subGroup: "text",
    }),
    title: field.text("見出し", { maxLength: 100, subGroup: "text" }),
    description: field.textarea("説明文", { maxLength: 500, subGroup: "text" }),
    buttons: field.array("ボタン", {
      subGroup: "button",
      fields: {
        text: field.text("ボタンの文字"),
        url: field.url("リンク先 URL"),
        variant: field.select("ボタンの種類", {
          options: buttonVariants,
          default: "primary",
        }),
        openInNewTab: field.boolean("新しいタブで開く"),
      },
    }),
    backgroundColor: field.color("背景色", { group: "design" }),
    variant: field.select("レイアウトの種類", {
      options: variants,
      default: "default",
      group: "design",
    }),
  })
  .refine(
    (data) =>
      new Set(data.buttons.map((b) => b.url)).size === data.buttons.length,
    {
      error: "同じURLのボタンを複数登録することはできません",
      path: ["buttons"],
    },
  );

export type CtaConfig = z.infer<typeof ctaConfigSchema>;
