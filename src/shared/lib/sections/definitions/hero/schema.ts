import { z } from "zod";

import { field } from "../../field-registry";
import { createButtonsArraySchema } from "../_shared/buttons";

const heightOptions = ["sm", "md", "lg", "full", "custom"] as const;

const variantOptions = [
  "default",
  "minimal",
  "split",
  "video",
  "parallax",
] as const;

export const heroConfigSchema = z.object({
  title: field.text("見出し", { maxLength: 100, subGroup: "text" }),
  subtitle: field.textarea("サブ見出し", {
    maxLength: 300,
    subGroup: "text",
  }),
  backgroundImageUrl: field.image("背景画像", { subGroup: "image" }),
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
  videoUrl: field.url("動画 URL", { subGroup: "image" }),
});

export type HeroConfig = z.infer<typeof heroConfigSchema>;
