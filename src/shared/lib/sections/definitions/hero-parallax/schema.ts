import { z } from "zod";

import { field } from "../../field-helpers";

const buttonVariants = ["primary", "secondary", "outline"] as const;
const buttonSizes = ["sm", "md", "lg"] as const;
const contentPositions = ["center", "left", "bottom-left"] as const;
const heightOptions = ["full", "80vh", "60vh"] as const;
const overlayStyles = ["gradient", "solid", "none"] as const;

export const heroParallaxConfigSchema = z.object({
  tagline: field
    .text("タグライン", { default: "Luxury Rental Space" })
    .pipe(z.string().max(50)),
  title: field
    .text("タイトル", { default: "洗練された空間で 特別なひとときを" })
    .pipe(z.string().max(100)),
  subtitle: field
    .textarea("サブタイトル", {
      default:
        "厳選されたレンタルスペースで、ビジネスからプライベートまで、あらゆるシーンに対応する上質な空間をご提供します。",
    })
    .pipe(z.string().max(300)),
  backgroundImageUrl: field.image("背景画像"),
  buttons: field.array("ボタン", {
    fields: {
      text: field.text("テキスト"),
      url: field.url("リンク先"),
      variant: field.select("スタイル", {
        options: buttonVariants,
        default: "primary",
      }),
      size: field.select("サイズ", {
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
  }),
  overlayGradient: field.boolean("グラデーションオーバーレイ", {
    default: true,
  }),
  scrollIndicator: field.boolean("スクロールインジケーター", { default: true }),
  contentPosition: field.select("コンテンツ位置", {
    options: contentPositions,
    default: "center",
  }),
  height: field.select("高さ", {
    options: heightOptions,
    default: "full",
  }),
  overlayStyle: field.select("オーバーレイスタイル", {
    options: overlayStyles,
    default: "gradient",
  }),
});

export type HeroParallaxConfig = z.infer<typeof heroParallaxConfigSchema>;
