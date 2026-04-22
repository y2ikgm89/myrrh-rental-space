import { z } from "zod";

import { field } from "../../field-registry";

const imagePositions = ["left", "right"] as const;
const textAligns = ["left", "center", "right"] as const;
const layouts = ["side-by-side", "stacked"] as const;
const imageAspects = ["original", "16:9", "4:3", "3:2", "1:1", "4:5"] as const;

export const conceptConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Our Philosophy" })
    .pipe(z.string().max(50)),
  heading: field
    .text("見出し", { default: "空間が、体験を変える" })
    .pipe(z.string().max(100)),
  body: field
    .textarea("本文", {
      default:
        "洗練されたデザインと機能性を兼ね備えた空間。\nビジネスミーティングからプライベートパーティーまで。\nあらゆるシーンに対応する上質な空間をご提供します。",
    })
    .pipe(z.string().max(1000)),
  imageUrl: field.image("画像"),
  imagePosition: field.select("画像位置", {
    options: imagePositions,
    default: "right",
    group: "design",
  }),
  textAlign: field.select("テキスト揃え", {
    options: textAligns,
    default: "left",
    group: "design",
  }),
  layout: field.select("レイアウト", {
    options: layouts,
    default: "side-by-side",
    group: "design",
  }),
  imageAspect: field.select("画像アスペクト比", {
    options: imageAspects,
    default: "original",
    group: "design",
  }),
});

export type ConceptConfig = z.infer<typeof conceptConfigSchema>;
