import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import {
  galleryLayoutValues,
  galleryGapValues,
  galleryImageAspectValues,
  galleryHoverEffectValues,
} from "@/shared/lib/validations/section-options";

export const galleryConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Gallery")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .optional()
    .meta({ description: "タイトル", fieldType: "text" }),
  images: z
    .array(
      z.object({
        url: z.string().url({ error: "有効なURLを入力してください" }),
        alt: z.string().max(200).optional(),
        caption: z.string().max(300).optional(),
      }),
    )
    .default([])
    .meta({ description: "画像", fieldType: "array" }),
  layout: z
    .enum(galleryLayoutValues)
    .default("grid")
    .meta({ description: "レイアウト", fieldType: "select" }),
  columns: z
    .number()
    .int()
    .min(1)
    .max(6)
    .default(3)
    .meta({ description: "列数" }),
  gap: z
    .enum(galleryGapValues)
    .default("md")
    .meta({ description: "間隔", fieldType: "select" }),
  enableLightbox: z
    .boolean()
    .default(true)
    .meta({ description: "ライトボックスを有効にする" }),
  imageAspect: z
    .enum(galleryImageAspectValues)
    .default("original")
    .meta({ description: "画像アスペクト比", fieldType: "select" }),
  hoverEffect: z
    .enum(galleryHoverEffectValues)
    .default("zoom")
    .meta({ description: "ホバーエフェクト", fieldType: "select" }),
});

export type GalleryConfig = z.output<typeof galleryConfigSchema>;

export const galleryDefinition: SectionDefinition<
  typeof galleryConfigSchema
> = {
  id: "gallery",
  meta: {
    label: "ギャラリー",
    description: "画像ギャラリーを表示します。",
    icon: "Images",
    category: "media",
  },
  configSchema: galleryConfigSchema,
  defaultConfig: galleryConfigSchema.parse({}),
  component: {
    type: "server",
    load: () =>
      import("../../../../../_components/GallerySection").then((m) => ({
        default: m.GallerySection,
      })),
  },
};
