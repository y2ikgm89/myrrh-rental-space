import { z } from "zod";

import { field } from "../../field-registry";
import { createImageGroupSchema } from "../_shared/image";
import { sectionLayoutSchema } from "../_shared/layout";

const imagePositions = ["left", "right"] as const;
const textAligns = ["left", "center", "right"] as const;
const layouts = ["side-by-side", "stacked"] as const;
const imageAspects = ["original", "16:9", "4:3", "3:2", "1:1", "4:5"] as const;

export const conceptConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "Our Philosophy",
    maxLength: 50,
    subGroup: "text",
  }),
  heading: field.text("見出し", {
    default: "空間が、体験を変える",
    maxLength: 100,
    subGroup: "text",
  }),
  body: field.textarea("本文", {
    default:
      "洗練されたデザインと機能性を兼ね備えた空間。\nビジネスミーティングからプライベートパーティーまで。\nあらゆるシーンに対応する上質な空間をご提供します。",
    maxLength: 1000,
    subGroup: "text",
  }),
  image: createImageGroupSchema("メイン画像"),
  imagePosition: field.select("画像の位置", {
    options: imagePositions,
    default: "right",
    group: "design",
  }),
  textAlign: field.select("テキストの揃え", {
    options: textAligns,
    default: "left",
    group: "design",
  }),
  contentLayout: field.select("コンテンツレイアウト", {
    options: layouts,
    default: "side-by-side",
    group: "design",
    helpText: "テキストと画像の並び方",
  }),
  imageAspect: field.select("画像のアスペクト比", {
    options: imageAspects,
    default: "original",
    group: "design",
  }),
  layout: sectionLayoutSchema,
});

export type ConceptConfig = z.infer<typeof conceptConfigSchema>;
