import { z } from "zod";

import { field } from "../../field-registry";
import { createButtonsArraySchema } from "../_shared/buttons";
import { createMediaGroupSchema } from "../_shared/media";
import { sectionLayoutSchema } from "../_shared/layout";

const heightOptions = ["sm", "md", "lg", "full", "custom"] as const;

/**
 * hero section variants
 *
 * - `default`: 中央配置 + 背景メディア（画像 or 動画）+ overlay
 * - `minimal`: 中央配置 + 背景なし
 * - `split`: 左テキスト + 右メディア
 * - `parallax`: scrub parallax 背景メディア
 *
 * 2026-05-24 PR (MediaPicker Phase 8): `backgroundImage` + `video` の 2 フィールド構成を
 * `backgroundMedia` 単一フィールドに統合（業界標準 WordPress Cover Block / Sanity Studio
 * パターン）。`variant="video"` も削除し、media URL 自体が動画なら video として描画される。
 */
const variantOptions = ["default", "minimal", "split", "parallax"] as const;

export const heroConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "",
    maxLength: 50,
    subGroup: "text",
    helpText: "見出しの上に表示される英語ラベル（例: Spaces / Events）",
  }),
  title: field.portableTextInline("見出し", { subGroup: "text" }),
  subtitle: field.portableTextBlock("サブ見出し", {
    subGroup: "text",
  }),
  backgroundMedia: createMediaGroupSchema("背景メディア（画像 / 動画）"),
  buttons: createButtonsArraySchema("ボタン"),
  height: field.select("高さ", {
    options: heightOptions,
    default: "md",
    group: "design",
  }),
  heightCustom: field.number("カスタム高さ", {
    min: 20,
    max: 100,
    default: 60,
    suffix: "svh",
    helpText: "100svh で画面いっぱい",
    group: "design",
  }),
  variant: field.select("レイアウトの種類", {
    options: variantOptions,
    default: "default",
    helpText: "ヒーローセクションの見せ方を選びます",
    group: "design",
  }),
  overlay: field.boolean("画像の上に黒いオーバーレイを重ねる", {
    default: true,
    group: "design",
  }),
  overlayOpacity: field.number("オーバーレイの濃さ", {
    min: 0,
    max: 100,
    default: 40,
    suffix: "%",
    helpText: "0% は透明、100% は完全に黒",
    group: "design",
  }),
  parallaxSpeed: field.number("パララックス速度", {
    min: 0,
    max: 1,
    default: 0.5,
    helpText: "0 で固定、1 で最大スクロール効果（variant=parallax 時に有効）",
    group: "design",
  }),
  layout: sectionLayoutSchema,
});

export type HeroConfig = z.infer<typeof heroConfigSchema>;
