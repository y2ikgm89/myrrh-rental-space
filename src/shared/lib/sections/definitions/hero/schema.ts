import { z } from "zod";

import { field } from "../../field-registry";
import { createButtonsArraySchema } from "../_shared/buttons";
import { createMediaArraySchema, HERO_BG_TRANSITIONS } from "../_shared/media";
import { sectionLayoutSchema } from "../_shared/layout";
import { createScrimFields } from "../_shared/scrim";

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

export const heroConfigSchema = z
  .object({
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
    backgroundMedia: createMediaArraySchema("背景メディア（画像 / 動画）"),
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
    ...createScrimFields(),
    parallaxSpeed: field.number("パララックス速度", {
      min: 0,
      max: 1,
      default: 0.5,
      helpText: "0 で固定、1 で最大スクロール効果（variant=parallax 時に有効）",
      group: "design",
    }),
    layout: sectionLayoutSchema,
  })
  .refine(
    (data) =>
      new Set(data.backgroundMedia.map((m) => m.url)).size ===
      data.backgroundMedia.length,
    {
      error: "同じメディアを複数登録することはできません",
      path: ["backgroundMedia"],
    },
  );

export type HeroConfig = z.infer<typeof heroConfigSchema>;
