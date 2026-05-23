import { z } from "zod";

import { field } from "../../field-registry";
import { createButtonsArraySchema } from "../_shared/buttons";
import { createImageGroupSchema } from "../_shared/image";
import { sectionLayoutSchema } from "../_shared/layout";

const heightOptions = ["sm", "md", "lg", "full", "custom"] as const;

const variantOptions = [
  "default",
  "minimal",
  "split",
  "video",
  "parallax",
] as const;

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
  backgroundImage: createImageGroupSchema("背景画像"),
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
  video: field.media("動画", {
    accept: "video",
    subGroup: "media",
    helpText:
      "R2 にアップロードした動画 / YouTube / Vimeo URL を選択 (variant=video 時のみ表示)",
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
