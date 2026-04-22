/**
 * PageHero — Page.pageHero JSON の Zod 正本（variant 別 discriminated union）
 *
 * 旧 homepage-hero Section は廃止され、ホームのヒーローはこのスキーマのみで検証する。
 */

import { z } from "zod";
import { isRecord } from "@/shared/lib/serialize";
import { createSafeUrlSchema } from "@/shared/lib/validations/cta-and-url";

/** parsePageHero 緩和用（defaults.ts との循環 import を避ける） */
const EDITORIAL_FALLBACK_IMAGES = [
  {
    url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
    alt: "自然光が差し込む開放的なレンタルスペース",
  },
] as const;

export const HERO_TRANSITIONS = [
  "crossfade",
  "ken-burns",
  "clip-reveal",
  "scale-fade",
] as const;

export type HeroTransition = (typeof HERO_TRANSITIONS)[number];

const heroTransitionSchema = z.enum(HERO_TRANSITIONS);

const heroImageSchema = z.object({
  url: z.string().url({ error: "画像URLが不正です" }),
  alt: z.string().min(1, { error: "alt は必須です" }),
});

const buttonUrlSchema = createSafeUrlSchema(500);

const pageHeroEditorialSplitSchema = z
  .object({
    variant: z.literal("editorial-split"),
    label: z.string().max(200).default(""),
    title: z.string().max(200).default(""),
    description: z.string().max(4000).default(""),
    images: z.array(heroImageSchema).min(1),
    transition: heroTransitionSchema.default("crossfade"),
    buttonText: z.string().max(100).default(""),
    buttonUrl: buttonUrlSchema.default("/"),
  })
  .refine(
    (data) =>
      new Set(data.images.map((i) => i.url)).size === data.images.length,
    { error: "同じ画像URLを複数登録することはできません", path: ["images"] },
  );

const pageHeroCompactSchema = z.object({
  variant: z.literal("compact"),
  image: heroImageSchema,
  label: z.string().max(200).default(""),
  title: z.string().max(200).default(""),
  description: z.string().max(4000).default(""),
});

const pageHeroMinimalSchema = z.object({
  variant: z.literal("minimal"),
  eyebrow: z.string().max(200).optional(),
  title: z.string().max(200).default(""),
  description: z.string().max(4000).default(""),
});

/**
 * 管理画面・API・公開ページ共通の PageHero 入力スキーマ
 */
export const pageHeroSchema = z.discriminatedUnion("variant", [
  pageHeroEditorialSplitSchema,
  pageHeroCompactSchema,
  pageHeroMinimalSchema,
]);

export type PageHero = z.infer<typeof pageHeroSchema>;

export type PageHeroInput = z.input<typeof pageHeroSchema>;

/**
 * DB / フォームの生 JSON を PageHero に正規化。不正時は null。
 *
 * editorial-split で images が空のレガシー行に対し、公開デフォルト画像で緩和する。
 */
export function parsePageHero(value: unknown): PageHero | null {
  const result = pageHeroSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }

  if (isRecord(value) && value["variant"] === "editorial-split") {
    const images = value["images"];
    const patched = {
      ...value,
      variant: "editorial-split" as const,
      images:
        Array.isArray(images) && images.length > 0
          ? images
          : [...EDITORIAL_FALLBACK_IMAGES],
    };
    const second = pageHeroSchema.safeParse(patched);
    return second.success ? second.data : null;
  }

  return null;
}
