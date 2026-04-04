import { z } from "zod";
import { field } from "../../field-helpers";

export const homepageHeroConfigSchema = z.object({
  label: field.text("ラベル", { default: "Volume One — Spring 2026" }),
  title: field.text("タイトル", { default: "Where silence works." }),
  description: field.textarea("説明文", {
    default:
      "静けさが仕事をする場所。Myrrh は光と余白を大切にした、思考のためのレンタルスペースです。",
  }),
  imageUrl: field.image("メイン画像"),
  imageAlt: field.text("画像alt", {
    default: "自然光が差し込む開放的なレンタルスペース",
  }),
  buttonText: field.text("ボタンテキスト", { default: "Explore spaces" }),
  buttonUrl: field.url("ボタンリンク先", { default: "/spaces" }),
});

export type HomepageHeroConfig = z.infer<typeof homepageHeroConfigSchema>;
