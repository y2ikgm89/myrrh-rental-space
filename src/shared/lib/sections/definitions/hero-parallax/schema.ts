import { z } from "zod";

import { field } from "../../field-registry";
import { createButtonsArraySchema } from "../_shared/buttons";
import { createImageGroupSchema } from "../_shared/image";
import { sectionLayoutSchema } from "../_shared/layout";

const contentPositions = ["center", "left", "bottom-left"] as const;
const heightOptions = ["sm", "md", "lg", "full", "custom"] as const;
const overlayStyles = ["gradient", "solid", "none"] as const;

export const heroParallaxConfigSchema = z.object({
  tagline: field.portableTextInline("タグライン", {
    subGroup: "text",
  }),
  title: field.portableTextInline("見出し", {
    subGroup: "text",
  }),
  subtitle: field.textarea("サブ見出し", {
    default:
      "厳選されたレンタルスペースで、ビジネスからプライベートまで、あらゆるシーンに対応する上質な空間をご提供します。",
    maxLength: 300,
    subGroup: "text",
  }),
  backgroundImage: createImageGroupSchema("背景画像"),
  buttons: createButtonsArraySchema("ボタン"),
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
  layout: sectionLayoutSchema,
});

export type HeroParallaxConfig = z.infer<typeof heroParallaxConfigSchema>;
