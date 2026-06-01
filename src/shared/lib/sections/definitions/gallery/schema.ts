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
    media: field.array("メディア", {
      subGroup: "media",
      fields: {
        url: field.media("メディア", { accept: "image-or-video" }),
        alt: field.text("代替テキスト"),
        caption: field.text("キャプション"),
      },
    }),
    gridLayout: field.select("ギャラリー表示", {
      options: layouts,
      default: "grid",
      group: "design",
      helpText: "メディアの並び方",
    }),
    columns: field.number("1 行あたりの列数", {
      min: 1,
      max: 6,
      default: 3,
      suffix: "列",
      group: "design",
    }),
    gap: field.select("メディアの間隔", {
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
    (data) => new Set(data.media.map((m) => m.url)).size === data.media.length,
    {
      error: "同じメディアを複数登録することはできません",
      path: ["media"],
    },
  );

export type GalleryConfig = z.infer<typeof galleryConfigSchema>;
