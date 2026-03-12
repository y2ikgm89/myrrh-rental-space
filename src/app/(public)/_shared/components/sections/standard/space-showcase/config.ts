import { z } from "zod";
import type { SectionMeta } from "@/shared/lib/sections/admin-registry";
import {
  cardStyleValues,
  showcaseImageAspectValues,
} from "@/shared/lib/validations/section-options";

export const spaceShowcaseConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Spaces")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("Our Spaces")
    .meta({ description: "タイトル", fieldType: "text" }),
  maxItems: z
    .number()
    .int()
    .min(1)
    .max(12)
    .default(3)
    .meta({ description: "最大表示数" }),
  showOnlyPublished: z
    .boolean()
    .default(true)
    .meta({ description: "公開中のみ表示する" }),
  columns: z
    .number()
    .int()
    .min(2)
    .max(4)
    .default(3)
    .meta({ description: "列数" }),
  cardStyle: z
    .enum(cardStyleValues)
    .default("bordered")
    .meta({ description: "カードスタイル", fieldType: "select" }),
  imageAspect: z
    .enum(showcaseImageAspectValues)
    .default("4:3")
    .meta({ description: "画像アスペクト比", fieldType: "select" }),
});

export type SpaceShowcaseConfig = z.output<typeof spaceShowcaseConfigSchema>;

export const spaceShowcaseMeta: SectionMeta<typeof spaceShowcaseConfigSchema> =
  {
    id: "space-showcase",
    meta: {
      label: "スペースショーケース",
      description: "スペースを大きなカードで魅力的に紹介します。",
      icon: "GalleryVerticalEnd",
      category: "list",
    },
    configSchema: spaceShowcaseConfigSchema,
    defaultConfig: spaceShowcaseConfigSchema.parse({}),
  };
