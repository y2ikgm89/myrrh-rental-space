import { z } from "zod";
import { field } from "../../field-registry";

export const homepageCtaConfigSchema = z.object({
  label: field.text("ラベル", { default: "Reservation" }),
  title: field.text("見出し", { default: "あなたに最適な空間を" }),
  description: field.textarea("説明文", {
    default:
      "空き状況の確認から予約まで、オンラインで完結。まずは空間をご覧ください。",
  }),
  buttonText: field.text("ボタンの文字", { default: "View All Spaces" }),
  buttonUrl: field.url("ボタンのリンク先 URL", { default: "/spaces" }),
});

export type HomepageCtaConfig = z.infer<typeof homepageCtaConfigSchema>;
