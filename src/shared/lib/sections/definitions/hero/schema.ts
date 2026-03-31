import { z } from "zod";

import { field } from "../../field-helpers";

const buttonVariants = ["primary", "secondary", "outline"] as const;

const heightOptions = ["sm", "md", "lg", "full"] as const;

const variantOptions = [
  "default",
  "minimal",
  "split",
  "video",
  "parallax",
] as const;

export const heroConfigSchema = z.object({
  title: field.text("タイトル").pipe(z.string().max(100)),
  subtitle: field.textarea("サブタイトル").pipe(z.string().max(300)),
  backgroundImageUrl: field.image("背景画像"),
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
  height: field.select("高さ", {
    options: heightOptions,
    default: "md",
  }),
  variant: field.select("バリエーション", {
    options: variantOptions,
    default: "default",
  }),
  overlay: field.boolean("オーバーレイ", { default: true }),
  overlayOpacity: field.number("オーバーレイ不透明度", {
    min: 0,
    max: 100,
    default: 40,
  }),
  videoUrl: field.url("動画URL"),
});

export type HeroConfig = z.infer<typeof heroConfigSchema>;
