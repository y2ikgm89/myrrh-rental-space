import { z } from "zod";

import { field } from "../../field-helpers";

const layouts = ["grid", "carousel", "list"] as const;
const variants = ["default", "card", "minimal"] as const;

export const testimonialConfigSchema = z.object({
  sectionLabel: field
    .text("セクションラベル", { default: "Testimonials" })
    .pipe(z.string().max(50)),
  title: field
    .text("タイトル", { default: "お客様の声" })
    .pipe(z.string().max(100)),
  items: field.array("レビュー", {
    fields: {
      content: field.textarea("内容"),
      authorName: field.text("名前"),
      authorTitle: field.text("肩書き"),
      authorImageUrl: field.image("アバター"),
      rating: field.number("評価", { min: 1, max: 5, default: 5 }),
    },
  }),
  layout: field.select("レイアウト", {
    options: layouts,
    default: "carousel",
  }),
  showRating: field.boolean("評価を表示", { default: true }),
  variant: field.select("バリエーション", {
    options: variants,
    default: "default",
  }),
});

export type TestimonialConfig = z.infer<typeof testimonialConfigSchema>;
