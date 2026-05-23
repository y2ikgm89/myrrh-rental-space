/**
 * page-hero セクション設定スキーマ
 *
 * variant 別 discriminated union（editorial-split / compact / minimal / video）。
 * Section レジストリに統合された正本。`Section.config` JSON 列に保存される。
 *
 * - editorial-split: 雑誌カバー風 2 列 + 複数静止画 carousel + transition 演出
 * - compact: 中型単一画像 + 右テキスト帯
 * - minimal: 画像なし、見出しとリードのみ
 * - video: 全面背景動画 + センター寄せ overlay テキスト（2026-05-24 追加、MediaPicker Phase 7）
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
 * video variant — 全面背景動画 + センター寄せ overlay テキスト
 *
 * 業界 reference: Apple Hero / Squarespace Video Backgrounds / Webflow Background Video。
 *
 * - `video`: R2 self-host mp4 / YouTube / Vimeo URL を受け付ける（VideoPlayer Primitive が
 *   `detectVideoProvider()` で自動 dispatch、`variant="background"` で auto-play + loop + mute）
 * - `posterImage`: 動画 load 中 / モバイル autoplay 失敗時 / 不明 provider 時のフォールバック
 * - `overlay` + `overlayOpacity`: 動画上のテキスト可読性確保（WCAG 1.4.3 准拠）
 */
const videoSchema = z.object({
  variant: z.literal("video"),
  label: field.portableTextInline("ラベル", { subGroup: "text" }),
  title: field.portableTextInline("タイトル", { subGroup: "text" }),
  description: field.portableTextBlock("説明", {
    subGroup: "text",
    maxBlocks: 100,
  }),
  video: field.media("動画", {
    accept: "video",
    subGroup: "media",
    helpText: "R2 にアップロードした動画 / YouTube / Vimeo URL を選択",
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
      helpText: "動画読み込み中・autoplay 失敗時に表示する代替画像",
    }),
  overlay: field.boolean("テキスト可読性のためのオーバーレイを表示", {
    default: true,
    group: "design",
    helpText: "動画上に半透明レイヤーを重ねて見出しを読みやすくする",
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
    videoSchema,
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
