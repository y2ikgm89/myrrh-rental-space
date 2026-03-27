import { z } from "zod";

/** ボタン要素スキーマ */
export const buttonItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  variant: z.enum(["primary", "secondary", "ghost"]),
});

/** 画像参照スキーマ */
export const imageRefSchema = z.object({
  src: z.string(),
  alt: z.string(),
  width: z.number(),
  height: z.number(),
});

/** 特徴カードスキーマ */
export const featureCardSchema = z.object({
  icon: z.string(),
  title: z.string(),
  description: z.string(),
});

/** ホームページコンテンツスキーマ */
export const homepageContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    subtitle: z.string(),
    image: imageRefSchema,
    cta: buttonItemSchema,
  }),
  concept: z.object({
    label: z.string(),
    heading: z.string(),
    body: z.string(),
    image: imageRefSchema,
  }),
  features: z.object({
    label: z.string(),
    heading: z.string(),
    items: z.array(featureCardSchema),
  }),
  cta: z.object({
    heading: z.string(),
    body: z.string(),
    buttons: z.array(buttonItemSchema),
  }),
});

/** ホームページコンテンツ型 */
export type HomepageContent = z.infer<typeof homepageContentSchema>;

/**
 * シンプルページコンテンツスキーマ
 *
 * compact hero（タイトル + 説明文）のみのページで共通使用
 * 対象: contact, faq, about, news, posts, reservation, terms, privacy
 */
export const simplePageContentSchema = z.object({
  hero: z.object({
    title: z.string(),
    description: z.string(),
  }),
});

/** シンプルページコンテンツ型 */
export type SimplePageContent = z.infer<typeof simplePageContentSchema>;
