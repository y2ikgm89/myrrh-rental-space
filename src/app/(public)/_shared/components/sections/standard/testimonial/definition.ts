import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import {
  testimonialLayoutValues,
  testimonialVariantValues,
} from "@/shared/lib/validations/section-options";

export const testimonialConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Testimonials")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("お客様の声")
    .meta({ description: "タイトル", fieldType: "text" }),
  items: z
    .array(
      z.object({
        content: z
          .string()
          .min(1, { error: "内容は必須です" })
          .max(1000, { error: "内容は1000文字以内です" }),
        authorName: z
          .string()
          .min(1, { error: "名前は必須です" })
          .max(50, { error: "名前は50文字以内です" }),
        authorTitle: z.string().max(100).optional(),
        authorImageUrl: z.string().url().optional().or(z.literal("")),
        rating: z.number().int().min(1).max(5).optional(),
      }),
    )
    .default([])
    .meta({ description: "お客様の声", fieldType: "array" }),
  layout: z
    .enum(testimonialLayoutValues)
    .default("carousel")
    .meta({ description: "レイアウト", fieldType: "select" }),
  showRating: z
    .boolean()
    .default(true)
    .meta({ description: "評価を表示する" }),
  variant: z
    .enum(testimonialVariantValues)
    .default("default")
    .meta({ description: "バリエーション", fieldType: "select" }),
});

export type TestimonialConfig = z.output<typeof testimonialConfigSchema>;

export const testimonialDefinition: SectionDefinition<
  typeof testimonialConfigSchema
> = {
  id: "testimonial",
  meta: {
    label: "体験談・レビュー",
    description: "お客様の声やレビューを表示します。",
    icon: "Quote",
    category: "media",
  },
  configSchema: testimonialConfigSchema,
  defaultConfig: testimonialConfigSchema.parse({}),
  component: {
    type: "server",
    load: () =>
      // @ts-expect-error -- migration: component uses typed props; will adopt SectionComponentProps<TConfig> in Task 13
      import("../../../../../_components/TestimonialSection").then((m) => ({
        default: m.TestimonialSection,
      })),
  },
};
