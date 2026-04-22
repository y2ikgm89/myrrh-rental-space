import { z } from "zod";

import { field } from "../../field-registry";

const buttonVariants = ["primary", "secondary", "outline"] as const;

const heightOptions = ["sm", "md", "lg", "full", "custom"] as const;

const variantOptions = [
  "default",
  "minimal",
  "split",
  "video",
  "parallax",
] as const;

export const heroConfigSchema = z
  .object({
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
      group: "design",
    }),
    heightCustom: field.number("カスタム高さ (svh)", {
      min: 20,
      max: 100,
      default: 60,
      helpText: "高さが「カスタム」の場合に使用（svh 単位）",
      group: "design",
    }),
    variant: field.select("バリエーション", {
      options: variantOptions,
      default: "default",
      group: "design",
    }),
    overlay: field.boolean("オーバーレイ", { default: true, group: "design" }),
    overlayOpacity: field.number("オーバーレイ不透明度", {
      min: 0,
      max: 100,
      default: 40,
      group: "design",
    }),
    videoUrl: field.url("動画URL"),
  })
  .refine(
    (data) =>
      new Set(data.buttons.map((b) => b.url)).size === data.buttons.length,
    {
      error: "同じURLのボタンを複数登録することはできません",
      path: ["buttons"],
    },
  );

export type HeroConfig = z.infer<typeof heroConfigSchema>;
