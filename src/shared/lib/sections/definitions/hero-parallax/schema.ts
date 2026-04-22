import { z } from "zod";

import { field } from "../../field-registry";

const buttonVariants = ["primary", "secondary", "outline"] as const;
const buttonSizes = ["sm", "md", "lg"] as const;
const contentPositions = ["center", "left", "bottom-left"] as const;
const heightOptions = ["sm", "md", "lg", "full", "custom"] as const;
const overlayStyles = ["gradient", "solid", "none"] as const;

export const heroParallaxConfigSchema = z
  .object({
    tagline: field
      .text("タグライン", { default: "Luxury Rental Space" })
      .pipe(z.string().max(50)),
    title: field
      .text("見出し", { default: "洗練された空間で 特別なひとときを" })
      .pipe(z.string().max(100)),
    subtitle: field
      .textarea("サブ見出し", {
        default:
          "厳選されたレンタルスペースで、ビジネスからプライベートまで、あらゆるシーンに対応する上質な空間をご提供します。",
      })
      .pipe(z.string().max(300)),
    backgroundImageUrl: field.image("背景画像"),
    buttons: field.array("ボタン", {
      fields: {
        text: field.text("ボタンの文字"),
        url: field.url("リンク先 URL"),
        variant: field.select("ボタンの種類", {
          options: buttonVariants,
          default: "primary",
        }),
        size: field.select("ボタンのサイズ", {
          options: buttonSizes,
          default: "md",
        }),
        openInNewTab: field.boolean("新しいタブで開く"),
      },
    }),
    parallaxSpeed: field.number("パララックス速度", {
      min: 0,
      max: 1,
      default: 0.3,
      helpText: "0 で固定、1 で最大スクロール効果",
      group: "design",
    }),
    overlayGradient: field.boolean("グラデーションオーバーレイを重ねる", {
      default: true,
      group: "design",
    }),
    scrollIndicator: field.boolean("スクロールインジケーターを表示する", {
      default: true,
      group: "design",
    }),
    contentPosition: field.select("コンテンツの位置", {
      options: contentPositions,
      default: "center",
      group: "design",
    }),
    height: field.select("高さ", {
      options: heightOptions,
      default: "lg",
      group: "design",
    }),
    heightCustom: field.number("カスタム高さ", {
      min: 20,
      max: 100,
      default: 80,
      suffix: "svh",
      helpText: "100svh で画面いっぱい",
      group: "design",
    }),
    overlayStyle: field.select("オーバーレイの種類", {
      options: overlayStyles,
      default: "gradient",
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

export type HeroParallaxConfig = z.infer<typeof heroParallaxConfigSchema>;
