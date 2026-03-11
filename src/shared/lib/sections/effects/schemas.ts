import { z } from "zod";

/** セクション単位のエフェクトオーバーレイ設定 */
const effectOverlayItemSchema = z.object({
  effectId: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const sectionEffectConfigSchema = z.object({
  overlays: z.array(effectOverlayItemSchema).default([]),
});

export type SectionEffectConfig = z.output<typeof sectionEffectConfigSchema>;

/** ページ単位のエフェクト設定（背景 + オーバーレイ） */
const pageEffectItemSchema = z.object({
  effectId: z.string(),
  params: z.record(z.string(), z.unknown()).default({}),
});

export const pageEffectConfigSchema = z.object({
  background: pageEffectItemSchema.nullable().default(null),
  overlay: pageEffectItemSchema.nullable().default(null),
});

export type PageEffectConfig = z.output<typeof pageEffectConfigSchema>;
