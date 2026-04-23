import { z } from "zod";

import { field } from "../../field-registry";

const layouts = ["grid", "carousel", "list"] as const;
const variants = ["default", "card", "minimal"] as const;

export const testimonialConfigSchema = z.object({
  sectionLabel: field.text("セクションラベル", {
    default: "Testimonials",
    maxLength: 50,
  }),
  title: field.text("見出し", {
    default: "お客様の声",
    maxLength: 100,
  }),
  items: field.array("レビュー", {
    fields: {
      content: field.textarea("レビュー内容"),
      authorName: field.text("お客様の名前"),
      authorTitle: field.text("肩書き"),
      authorImageUrl: field.image("アバター画像"),
      rating: field.number("評価", {
        min: 1,
        max: 5,
        default: 5,
        helpText: "1〜5 の星評価",
      }),
    },
  }),
  layout: field.select("レイアウト", {
    options: layouts,
    default: "carousel",
    group: "design",
  }),
  showRating: field.boolean("星評価を表示する", { default: true }),
  variant: field.select("レイアウトの種類", {
    options: variants,
    default: "default",
    group: "design",
  }),
});

export type TestimonialConfig = z.infer<typeof testimonialConfigSchema>;
