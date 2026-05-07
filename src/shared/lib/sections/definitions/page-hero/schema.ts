/**
 * page-hero セクション設定スキーマ
 *
 * variant 別 discriminated union（editorial-split / compact / minimal）。
 * 旧 `@/shared/lib/sections/page-hero/schema.ts` を Section レジストリに統合した正本。
 */

import { z } from "zod";

import { field, fieldRegistry } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";
import { createButtonsArraySchema } from "../_shared/buttons";

const HERO_TRANSITIONS = [
  "crossfade",
  "ken-burns",
  "clip-reveal",
  "scale-fade",
] as const;

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
        url: field.image("画像"),
        alt: field.text("代替テキスト"),
      },
    })
    .refine((arr) => new Set(arr.map((i) => i.url)).size === arr.length, {
      error: "同じ画像を複数登録することはできません",
      path: ["images"],
    }),
  transition: field.select("トランジション", {
    subGroup: "image",
    options: HERO_TRANSITIONS,
    default: "crossfade",
    helpText: "複数画像表示時の切り替え演出",
  }),
  buttons: createButtonsArraySchema(),
  layout: sectionLayoutSchema,
});

const compactSchema = z.object({
  variant: z.literal("compact"),
  label: field.text("ラベル", { subGroup: "text", maxLength: 200 }),
  title: field.text("タイトル", { subGroup: "text", maxLength: 200 }),
  description: field.textarea("説明", { subGroup: "text", maxLength: 4000 }),
  image: z
    .object({
      url: field.image("画像"),
      alt: field.text("代替テキスト"),
    })
    .prefault({})
    .register(fieldRegistry, {
      fieldType: "group",
      label: "ヒーロー画像",
      group: "content",
      subGroup: "image",
    }),
  buttons: createButtonsArraySchema(),
  layout: sectionLayoutSchema,
});

const minimalSchema = z.object({
  variant: z.literal("minimal"),
  eyebrow: field.text("アイブロー", { subGroup: "text", maxLength: 200 }),
  title: field.text("タイトル", { subGroup: "text", maxLength: 200 }),
  description: field.textarea("説明", { subGroup: "text", maxLength: 4000 }),
  layout: sectionLayoutSchema,
});

/**
 * pageHeroConfigSchema は discriminated union 自体を fieldRegistry に register する。
 *
 * AutoSectionForm の zod-introspection は `extractDiscriminatedUnionInfo()` で
 * `_zod.def.options` を辿り、各 option の `variant: z.literal(...)` から literal 値を
 * 集約して synthesize した select field として描画する。`fieldType: "select"` の meta が
 * registry に attach されているため、discriminator field の label / group / subGroup は
 * ここで宣言する（zod-introspection 内のフォールバック値ではなくこちらが正本）。
 *
 * variant 切替時は AutoSectionForm が `useWatch` + `form.reset()` で新 variant の
 * default 値を流し込む（共通フィールドも reset、RHF 公式パターン）。
 */
export const pageHeroConfigSchema = z
  .discriminatedUnion("variant", [
    editorialSplitSchema,
    compactSchema,
    minimalSchema,
  ])
  .register(fieldRegistry, {
    fieldType: "select",
    label: "バリアント",
    group: "content",
    subGroup: "other",
    helpText: "変更すると他のフィールドは新バリアントの初期値で再生成されます",
  });

export type PageHeroConfig = z.infer<typeof pageHeroConfigSchema>;
export type PageHeroConfigInput = z.input<typeof pageHeroConfigSchema>;
export type PageHeroVariant = PageHeroConfig["variant"];

export { HERO_TRANSITIONS };
export type HeroTransition = (typeof HERO_TRANSITIONS)[number];
