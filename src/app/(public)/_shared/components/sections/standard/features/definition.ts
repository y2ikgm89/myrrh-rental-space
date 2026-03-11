import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import { featuresLayoutValues } from "@/shared/lib/validations/section-options";

export const featuresConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Features")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("Features")
    .meta({ description: "タイトル", fieldType: "text" }),
  items: z
    .array(
      z.object({
        icon: z.string().max(50).optional(),
        title: z
          .string()
          .min(1, { error: "タイトルは必須です" })
          .max(100, { error: "タイトルは100文字以内です" }),
        description: z
          .string()
          .max(500, { error: "説明は500文字以内です" })
          .optional(),
      }),
    )
    .default([])
    .meta({ description: "特徴項目", fieldType: "array" }),
  columns: z
    .number()
    .int()
    .min(1)
    .max(4)
    .default(3)
    .meta({ description: "列数" }),
  layout: z
    .enum(featuresLayoutValues)
    .default("hero-first")
    .meta({ description: "レイアウト", fieldType: "select" }),
});

export type FeaturesConfig = z.output<typeof featuresConfigSchema>;

export const featuresDefinition: SectionDefinition<
  typeof featuresConfigSchema
> = {
  id: "features",
  meta: {
    label: "特徴",
    description: "特徴をアイコン付きカードで表示します。",
    icon: "Zap",
    category: "content",
  },
  configSchema: featuresConfigSchema,
  defaultConfig: featuresConfigSchema.parse({}),
  component: {
    type: "server",
    load: () =>
      // @ts-expect-error -- migration: component uses typed props; will adopt SectionComponentProps<TConfig> in Task 13
      import("../../../../../_components/FeaturesSection").then((m) => ({
        default: m.FeaturesSection,
      })),
  },
};
