import { z } from "zod";
import type { SectionDefinition } from "@/shared/lib/sections/types";
import {
  imagePositionValues,
  textAlignValues,
  conceptLayoutValues,
  imageAspectValues,
} from "@/shared/lib/validations/section-options";

export const conceptConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Our Philosophy")
    .meta({ description: "セクションラベル", fieldType: "text" }),
  heading: z
    .string()
    .max(100, { error: "見出しは100文字以内です" })
    .default("空間が、体験を変える")
    .meta({ description: "見出し", fieldType: "text" }),
  body: z
    .string()
    .max(1000, { error: "本文は1000文字以内です" })
    .default(
      "洗練されたデザインと上質な設備が調和する空間。",
    )
    .meta({ description: "本文", fieldType: "textarea" }),
  imageUrl: z
    .string()
    .url({ error: "有効なURLを入力してください" })
    .optional()
    .or(z.literal(""))
    .meta({ description: "画像URL", fieldType: "image" }),
  imagePosition: z
    .enum(imagePositionValues)
    .default("right")
    .meta({ description: "画像位置", fieldType: "select" }),
  textAlign: z
    .enum(textAlignValues)
    .default("left")
    .meta({ description: "テキスト揃え", fieldType: "select" }),
  layout: z
    .enum(conceptLayoutValues)
    .default("side-by-side")
    .meta({ description: "レイアウト", fieldType: "select" }),
  imageAspect: z
    .enum(imageAspectValues)
    .default("original")
    .meta({ description: "画像アスペクト比", fieldType: "select" }),
});

export type ConceptConfig = z.output<typeof conceptConfigSchema>;

export const conceptDefinition: SectionDefinition<
  typeof conceptConfigSchema
> = {
  id: "concept",
  meta: {
    label: "コンセプト",
    description:
      "見出し・本文・画像の2カラム構成。ブランドストーリーの表現に最適。",
    icon: "Sparkles",
    category: "content",
  },
  configSchema: conceptConfigSchema,
  defaultConfig: conceptConfigSchema.parse({}),
  component: {
    type: "server",
    load: () =>
      // @ts-expect-error -- migration: component uses typed props; will adopt SectionComponentProps<TConfig> in Task 13
      import("../../../../../_components/ConceptSection").then((m) => ({
        default: m.ConceptSection,
      })),
  },
};
