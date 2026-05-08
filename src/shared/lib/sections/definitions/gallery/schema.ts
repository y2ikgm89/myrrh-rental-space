import { z } from "zod";

import { field } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";

const layouts = ["grid", "masonry", "carousel"] as const;
const gaps = ["none", "sm", "md", "lg"] as const;
const imageAspects = ["original", "4:3", "1:1", "16:9"] as const;
const hoverEffects = ["zoom", "overlay", "none"] as const;

export const galleryConfigSchema = z
  .object({
    sectionLabel: field.text("セクションラベル", {
      default: "Gallery",
      maxLength: 50,
      subGroup: "text",
    }),
    title: field.portableTextInline("見出し", { subGroup: "text" }),
    images: field.array("画像", {
      subGroup: "image",
      fields: {
        url: field.image("画像"),
        alt: field.text("代替テキスト"),
        caption: field.text("キャプション"),
      },
    }),
    gridLayout: field.select("ギャラリー表示", {
      options: layouts,
      default: "grid",
      group: "design",
      helpText: "画像の並び方",
    }),
    columns: field.number("1 行あたりの列数", {
      min: 1,
      max: 6,
      default: 3,
      suffix: "列",
      group: "design",
    }),
    gap: field.select("画像の間隔", {
      options: gaps,
      default: "md",
      group: "design",
    }),
    enableLightbox: field.boolean("クリックで拡大表示する（ライトボックス）", {
      default: true,
    }),
    imageAspect: field.select("画像のアスペクト比", {
      options: imageAspects,
      default: "original",
      group: "design",
    }),
    hoverEffect: field.select("ホバー時のエフェクト", {
      options: hoverEffects,
      default: "zoom",
      group: "design",
    }),
    layout: sectionLayoutSchema,
  })
  .refine(
    (data) =>
      new Set(data.images.map((i) => i.url)).size === data.images.length,
    {
      error: "同じ画像を複数登録することはできません",
      path: ["images"],
    },
  );

export type GalleryConfig = z.infer<typeof galleryConfigSchema>;
