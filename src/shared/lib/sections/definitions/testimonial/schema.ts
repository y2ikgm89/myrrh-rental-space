import { z } from "zod";

import { field } from "../../field-registry";
import { createCompactImageGroupSchema } from "../_shared/image";
import { sectionLayoutSchema } from "../_shared/layout";
import { sectionHeaderFields } from "../_shared/section-header";

const layouts = ["grid", "carousel", "list"] as const;
const variants = ["default", "card", "minimal"] as const;

export const testimonialConfigSchema = z.object({
  ...sectionHeaderFields({ sectionLabelDefault: "Testimonials" }),
  items: field.array("レビュー", {
    subGroup: "text",
    fields: {
      content: field.portableTextBlock("レビュー内容"),
      authorName: field.portableTextInline("お客様の名前"),
      authorTitle: field.portableTextInline("肩書き"),
      authorImage: createCompactImageGroupSchema("プロフィール画像"),
      rating: field.number("評価", {
        min: 1,
        max: 5,
        default: 5,
        helpText: "1〜5 の星評価",
      }),
    },
  }),
  displayLayout: field.select("表示レイアウト", {
    options: layouts,
    default: "carousel",
    group: "design",
    helpText: "レビューの並び方",
  }),
  showRating: field.boolean("星評価を表示する", { default: true }),
  variant: field.select("レイアウトの種類", {
    options: variants,
    default: "default",
    group: "design",
  }),
  layout: sectionLayoutSchema,
});

export type TestimonialConfig = z.infer<typeof testimonialConfigSchema>;
