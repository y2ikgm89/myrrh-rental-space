/**
 * page-hero セクション設定スキーマ
 *
 * variant 別 discriminated union（editorial-split / compact / minimal）。
 * 旧 `@/shared/lib/sections/page-hero/schema.ts` を Section レジストリに統合した正本。
 */

import { z } from "zod";

import { field, fieldRegistry } from "../../field-registry";
import { createInternalAppRouteSchema } from "@/shared/lib/validations/cta-and-url";

const HERO_TRANSITIONS = [
  "crossfade",
  "ken-burns",
  "clip-reveal",
  "scale-fade",
] as const;

/**
 * 内部 app route 専用 buttonUrl スキーマ。
 * `next/link` に渡すため外部 URL は禁止。`field.url()` は full URL only のため使えない。
 * fieldRegistry.add で URL field として subGroup="button" メタを登録する。
 */
const buttonUrlSchema = createInternalAppRouteSchema(500)
  .default("/")
  .register(fieldRegistry, {
    fieldType: "url",
    label: "ボタン URL",
    group: "content",
    subGroup: "button",
  });

const editorialSplitSchema = z.object({
  variant: z.literal("editorial-split"),
  label: field.text("ラベル", { subGroup: "text", maxLength: 200 }),
  title: field.text("タイトル", { subGroup: "text", maxLength: 200 }),
  description: field.textarea("説明", {
    subGroup: "text",
    maxLength: 4000,
  }),
  images: field
    .array("ヒーロー画像", {
      subGroup: "image",
      fields: {
        url: field.image("画像 URL"),
        alt: field.text("代替テキスト"),
      },
    })
    .refine((arr) => new Set(arr.map((i) => i.url)).size === arr.length, {
      error: "同じ画像URLを複数登録することはできません",
      path: ["images"],
    }),
  transition: field.select("トランジション", {
    subGroup: "image",
    options: HERO_TRANSITIONS,
    default: "crossfade",
    helpText: "複数画像表示時の切り替え演出",
  }),
  buttonText: field.text("ボタン文言", {
    subGroup: "button",
    maxLength: 100,
  }),
  buttonUrl: buttonUrlSchema,
});

const compactSchema = z.object({
  variant: z.literal("compact"),
  label: field.text("ラベル", { subGroup: "text", maxLength: 200 }),
  title: field.text("タイトル", { subGroup: "text", maxLength: 200 }),
  description: field.textarea("説明", { subGroup: "text", maxLength: 4000 }),
  image: field.group(
    "ヒーロー画像",
    {
      url: field.image("画像 URL"),
      alt: field.text("代替テキスト"),
    },
    { subGroup: "image" },
  ),
});

const minimalSchema = z.object({
  variant: z.literal("minimal"),
  eyebrow: field.text("アイブロー", { subGroup: "text", maxLength: 200 }),
  title: field.text("タイトル", { subGroup: "text", maxLength: 200 }),
  description: field.textarea("説明", { subGroup: "text", maxLength: 4000 }),
});

export const pageHeroConfigSchema = z.discriminatedUnion("variant", [
  editorialSplitSchema,
  compactSchema,
  minimalSchema,
]);

export type PageHeroConfig = z.infer<typeof pageHeroConfigSchema>;
export type PageHeroConfigInput = z.input<typeof pageHeroConfigSchema>;
export type PageHeroVariant = PageHeroConfig["variant"];

export { HERO_TRANSITIONS };
export type HeroTransition = (typeof HERO_TRANSITIONS)[number];
