import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import {
  heroHeightValues,
  heroVariantValues,
} from "@/shared/lib/validations/section-options";
import {
  createSafeUrlSchema,
  createCtaButtonItemSchema,
} from "@/shared/lib/validations/section-design";

const safeUrlSchema = createSafeUrlSchema(500);
const ctaButtonItemSchema = createCtaButtonItemSchema(safeUrlSchema);

export const heroConfigSchema = z.object({
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .optional()
    .meta({ description: "タイトル", fieldType: "text" }),
  subtitle: z
    .string()
    .max(300, { error: "サブタイトルは300文字以内です" })
    .optional()
    .meta({ description: "サブタイトル", fieldType: "textarea" }),
  backgroundImageUrl: z
    .string()
    .url({ error: "有効なURLを入力してください" })
    .optional()
    .or(z.literal(""))
    .meta({ description: "背景画像URL", fieldType: "image" }),
  buttons: z
    .array(ctaButtonItemSchema)
    .optional()
    .meta({ description: "CTAボタン", fieldType: "array" }),
  height: z
    .enum(heroHeightValues)
    .default("md")
    .meta({ description: "高さ", fieldType: "select" }),
  overlay: z
    .boolean()
    .default(true)
    .meta({ description: "オーバーレイを表示する" }),
  overlayOpacity: z
    .number()
    .min(0)
    .max(100)
    .default(40)
    .meta({ description: "オーバーレイ透明度（0〜100）" }),
  variant: z
    .enum(heroVariantValues)
    .default("default")
    .meta({ description: "バリエーション", fieldType: "select" }),
  videoUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal(""))
    .meta({ description: "動画URL", fieldType: "text" }),
  parallaxSpeed: z
    .number()
    .min(0)
    .max(1)
    .default(0.5)
    .meta({ description: "パララックス速度（0〜1）" }),
});

export type HeroConfig = z.output<typeof heroConfigSchema>;

export const heroDefinition: SectionDefinition<typeof heroConfigSchema> = {
  id: "hero",
  meta: {
    label: "ヒーロー",
    description:
      "ページ上部に表示する大きなバナー。背景画像とCTAボタンを配置できます。",
    icon: "Image",
    category: "hero",
  },
  configSchema: heroConfigSchema,
  defaultConfig: heroConfigSchema.parse({}),
  component: {
    type: "server",
    load: () =>
      import("../../../../../_components/StandardHeroSection").then((m) => ({
        default: m.StandardHeroSection,
      })),
  },
};
