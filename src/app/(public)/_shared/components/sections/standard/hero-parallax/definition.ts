import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import {
  contentPositionValues,
  heroParallaxHeightValues,
  overlayStyleValues,
} from "@/shared/lib/validations/section-options";
import {
  createSafeUrlSchema,
  createCtaButtonItemSchema,
} from "@/shared/lib/validations/section-design";

const safeUrlSchema = createSafeUrlSchema(500);
const ctaButtonItemSchema = createCtaButtonItemSchema(safeUrlSchema);

export const heroParallaxConfigSchema = z.object({
  tagline: z
    .string()
    .max(50, { error: "タグラインは50文字以内です" })
    .default("Luxury Rental Space")
    .meta({ description: "タグライン", fieldType: "text" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("洗練された空間で 特別なひとときを")
    .meta({ description: "タイトル", fieldType: "text" }),
  subtitle: z
    .string()
    .max(300, { error: "サブタイトルは300文字以内です" })
    .default(
      "厳選されたレンタルスペースが、あなたの大切な瞬間を彩ります。",
    )
    .meta({ description: "サブタイトル", fieldType: "textarea" }),
  backgroundImageUrl: z
    .string()
    .url({ error: "有効なURLを入力してください" })
    .optional()
    .or(z.literal(""))
    .meta({ description: "背景画像URL", fieldType: "image" }),
  buttons: z
    .array(ctaButtonItemSchema)
    .default([
      {
        text: "Reserve Now",
        url: "/reservation",
        variant: "primary",
        size: "lg",
        openInNewTab: false,
      },
    ])
    .meta({ description: "CTAボタン", fieldType: "array" }),
  parallaxSpeed: z
    .number()
    .min(0)
    .max(1)
    .default(0.3)
    .meta({ description: "パララックス速度（0〜1）" }),
  overlayGradient: z
    .boolean()
    .default(true)
    .meta({ description: "グラデーションオーバーレイを表示する" }),
  scrollIndicator: z
    .boolean()
    .default(true)
    .meta({ description: "スクロールインジケーターを表示する" }),
  contentPosition: z
    .enum(contentPositionValues)
    .default("center")
    .meta({ description: "コンテンツ配置", fieldType: "select" }),
  height: z
    .enum(heroParallaxHeightValues)
    .default("full")
    .meta({ description: "高さ", fieldType: "select" }),
  overlayStyle: z
    .enum(overlayStyleValues)
    .default("gradient")
    .meta({ description: "オーバーレイスタイル", fieldType: "select" }),
});

export type HeroParallaxConfig = z.output<typeof heroParallaxConfigSchema>;

export const heroParallaxDefinition: SectionDefinition<
  typeof heroParallaxConfigSchema
> = {
  id: "hero-parallax",
  meta: {
    label: "パララックスヒーロー",
    description:
      "パララックス効果付きヒーロー。スクロールに連動した奥行きのある表現。",
    icon: "Layers",
    category: "hero",
  },
  configSchema: heroParallaxConfigSchema,
  defaultConfig: heroParallaxConfigSchema.parse({}),
  component: {
    type: "client",
    load: () =>
      import("../../../../../_components/HeroSection").then((m) => ({
        default: m.HeroSection,
      })),
  },
};
