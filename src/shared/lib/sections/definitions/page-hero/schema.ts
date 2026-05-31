/**
 * page-hero セクション設定スキーマ
 *
 * variant 別 discriminated union（editorial-split / compact / minimal / media）。
 * Section レジストリに統合された正本。`Section.config` JSON 列に保存される。
 *
 * - editorial-split: 雑誌カバー風 2 列 + 複数静止画 carousel + transition 演出
 * - compact: 中型単一画像 + 右テキスト帯
 * - minimal: 画像なし、見出しとリードのみ
 * - media: 全面背景メディア（画像 OR 動画）+ センター寄せ overlay テキスト
 *
 * 2026-05-24 PR (MediaPicker Phase 8): 旧 `video` variant を `media` variant にリネーム
 * し、`video` フィールド（動画専用）を `backgroundMedia` group（accept: image-or-video）
 * に統合。業界標準 WordPress Cover Block / Sanity Studio / Squarespace Hero Block の
 * 「単一 media field + runtime discriminate」パターンと整合。
 * `posterImage` は動画選択時の load 中 / autoplay 失敗時 fallback として残す。
 */

import { z } from "zod";

import { field, fieldRegistry } from "../../field-registry";
import { sectionLayoutSchema } from "../_shared/layout";
import { createButtonsArraySchema } from "../_shared/buttons";
import { createMediaArraySchema, HERO_BG_TRANSITIONS } from "../_shared/media";

const HERO_TRANSITIONS = [
  "crossfade",
  "ken-burns",
  "clip-reveal",
  "scale-fade",
] as const;

const editorialSplitSchema = z.object({
  variant: z.literal("editorial-split"),
  label: field.portableTextInline("ラベル", { subGroup: "text" }),
  title: field.portableTextInline("タイトル", { subGroup: "text" }),
  description: field.portableTextBlock("説明", {
    subGroup: "text",
    maxBlocks: 100,
  }),
  images: field
    .array("ヒーロー画像", {
      subGroup: "media",
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
    subGroup: "media",
    options: HERO_TRANSITIONS,
    default: "crossfade",
    helpText: "複数画像表示時の切り替え演出",
  }),
  buttons: createButtonsArraySchema(),
  layout: sectionLayoutSchema,
});

const compactSchema = z.object({
  variant: z.literal("compact"),
  label: field.portableTextInline("ラベル", { subGroup: "text" }),
  title: field.portableTextInline("タイトル", { subGroup: "text" }),
  description: field.portableTextBlock("説明", {
    subGroup: "text",
    maxBlocks: 100,
  }),
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
      subGroup: "media",
    }),
  buttons: createButtonsArraySchema(),
  layout: sectionLayoutSchema,
});

const minimalSchema = z.object({
  variant: z.literal("minimal"),
  eyebrow: field.text("アイブロー", { subGroup: "text", maxLength: 200 }),
  title: field.portableTextInline("タイトル", { subGroup: "text" }),
  description: field.portableTextBlock("説明", {
    subGroup: "text",
    maxBlocks: 100,
  }),
  layout: sectionLayoutSchema,
});

/**
 * media variant — 全面背景メディア（画像 OR 動画）+ センター寄せ overlay テキスト
 *
 * 業界 reference: WordPress Cover Block / Apple Hero / Squarespace Hero / Webflow
 * Background Video。`media.url` が動画なら VideoPlayer Primitive で auto-play + loop +
 * mute、画像なら next/image で表示する（runtime に `detectMediaSourceType()` で派生）。
 *
 * - `media`: 画像 / 動画どちらでも選択可能（WordPress Cover Block の `mediaUrl` 等価）
 * - `posterImage`: 動画選択時の load 中 / autoplay 失敗時の fallback（画像時は未使用）
 * - `overlay` + `overlayOpacity`: メディア上のテキスト可読性確保（WCAG 1.4.3 准拠）
 */
const mediaSchema = z.object({
  variant: z.literal("media"),
  label: field.portableTextInline("ラベル", { subGroup: "text" }),
  title: field.portableTextInline("タイトル", { subGroup: "text" }),
  description: field.portableTextBlock("説明", {
    subGroup: "text",
    maxBlocks: 100,
  }),
  media: createMediaArraySchema("背景メディア（画像 / 動画）"),
  transition: field.select("切り替え演出", {
    options: HERO_BG_TRANSITIONS,
    default: "crossfade",
    group: "design",
    helpText: "背景メディアが複数のときのスライドショー切り替え方法",
  }),
  autoPlayInterval: field.number("自動切り替え間隔", {
    min: 2,
    max: 20,
    default: 5,
    suffix: "秒",
    group: "design",
    helpText: "画像スライドの表示秒数（動画は再生完了で切り替わります）",
  }),
  posterImage: z
    .object({
      url: field.image("ポスター画像"),
      alt: field.text("代替テキスト"),
    })
    .prefault({})
    .register(fieldRegistry, {
      fieldType: "group",
      label: "ポスター画像",
      group: "content",
      subGroup: "media",
      helpText: "動画選択時の読み込み中・autoplay 失敗時に表示する代替画像",
    }),
  overlay: field.boolean("テキスト可読性のためのオーバーレイを表示", {
    default: true,
    group: "design",
    helpText: "メディア上に半透明レイヤーを重ねて見出しを読みやすくする",
  }),
  overlayOpacity: field.number("オーバーレイの濃さ", {
    min: 0,
    max: 100,
    default: 40,
    suffix: "%",
    group: "design",
    helpText: "0% は透明、100% は完全に黒",
  }),
  buttons: createButtonsArraySchema(),
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
    mediaSchema,
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
