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
    title: field.text("見出し").pipe(z.string().max(100)),
    subtitle: field.textarea("サブ見出し").pipe(z.string().max(300)),
    backgroundImageUrl: field.image("背景画像"),
    buttons: field.array("ボタン", {
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
    height: field.select("高さ", {
      options: heightOptions,
      default: "md",
      group: "design",
    }),
    heightCustom: field.number("カスタム高さ", {
      min: 20,
      max: 100,
      default: 60,
      suffix: "svh",
      helpText: "100svh で画面いっぱい",
      group: "design",
    }),
    variant: field.select("レイアウトの種類", {
      options: variantOptions,
      default: "default",
      helpText: "ヒーローセクションの見せ方を選びます",
      group: "design",
    }),
    overlay: field.boolean("画像の上に黒いオーバーレイを重ねる", {
      default: true,
      group: "design",
    }),
    overlayOpacity: field.number("オーバーレイの濃さ", {
      min: 0,
      max: 100,
      default: 40,
      suffix: "%",
      helpText: "0% は透明、100% は完全に黒",
      group: "design",
    }),
    videoUrl: field.url("動画 URL"),
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
