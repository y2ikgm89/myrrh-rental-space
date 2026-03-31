import { z } from "zod";

import { field } from "../../field-helpers";

const layouts = ["grid", "masonry", "carousel"] as const;
const gaps = ["none", "sm", "md", "lg"] as const;
const imageAspects = ["original", "4:3", "1:1", "16:9"] as const;
const hoverEffects = ["zoom", "overlay", "none"] as const;

export const galleryConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Gallery" })
    .pipe(z.string().max(50)),
  title: field.text("タイトル").pipe(z.string().max(100)),
  images: field.array("画像", {
    fields: {
      url: field.image("URL"),
      alt: field.text("代替テキスト"),
      caption: field.text("キャプション"),
    },
  }),
  layout: field.select("レイアウト", {
    options: layouts,
    default: "grid",
  }),
  columns: field.number("カラム数", { min: 1, max: 6, default: 3 }),
  gap: field.select("間隔", {
    options: gaps,
    default: "md",
  }),
  enableLightbox: field.boolean("ライトボックス", { default: true }),
  imageAspect: field.select("画像アスペクト比", {
    options: imageAspects,
    default: "original",
  }),
  hoverEffect: field.select("ホバーエフェクト", {
    options: hoverEffects,
    default: "zoom",
  }),
});

export type GalleryConfig = z.infer<typeof galleryConfigSchema>;
