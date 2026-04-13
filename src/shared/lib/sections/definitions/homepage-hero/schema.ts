import { z } from "zod";
import { field } from "../../field-helpers";

export const HERO_TRANSITIONS = [
  "crossfade",
  "ken-burns",
  "clip-reveal",
  "scale-fade",
] as const;

export type HeroTransition = (typeof HERO_TRANSITIONS)[number];

export const homepageHeroConfigSchema = z.object({
  label: field.text("ラベル", { default: "Volume One — Spring 2026" }),
  title: field.text("タイトル", { default: "Where silence works." }),
  description: field.textarea("説明文", {
    default:
      "静けさが仕事をする場所。Myrrh は光と余白を大切にした、思考のためのレンタルスペースです。",
  }),
  images: field.array("スライド画像", {
    fields: {
      url: field.image("画像URL"),
      alt: field.text("alt テキスト"),
    },
    helpText: "複数画像を追加するとクロスフェードで自動切替されます",
  }),
  transition: field.select("切替アニメーション", {
    options: HERO_TRANSITIONS,
    default: "crossfade",
    helpText:
      "crossfade: 溶け合い / ken-burns: ゆっくりズーム / clip-reveal: スライド露出 / scale-fade: 拡大フェード",
  }),
  buttonText: field.text("ボタンテキスト", { default: "Explore spaces" }),
  buttonUrl: field.url("ボタンリンク先", { default: "/spaces" }),
});

export type HomepageHeroConfig = z.infer<typeof homepageHeroConfigSchema>;
